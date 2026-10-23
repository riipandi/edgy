#!/bin/sh
# Registers the ClickStack account, then creates or updates every dashboard in
# /dashboards through the v2 REST API. Re-runnable: an existing dashboard is
# updated in place, so a restart never leaves duplicates behind.
#
# The API only answers with the user's personal access key, so the script logs
# in with the same credentials it registers and reads the key from /api/me.
# CLICKSTACK_ACCESS_KEY skips that round trip.
set -eu

web=http://localhost:8080
api=http://clickstack:8000/api/v2
dir=/dashboards

# The session cookie is scoped to the host FRONTEND_URL names (localhost), and
# the init container reaches that host as `clickstack`; --connect-to keeps the
# request's own host while dialling the container.
web_curl() { curl --connect-to localhost:8080:clickstack:8080 "$@"; }

i=0
until curl -sf http://clickstack:8080/api/health >/dev/null; do
    i=$((i + 1))
    if [ "$i" -ge 90 ]; then
        echo 'HyperDX did not become ready'
        exit 1
    fi
    sleep 2
done

credentials=$(printf '{"email":"%s","password":"%s","confirmPassword":"%s"}' \
    "$HYPERDX_EMAIL" "$HYPERDX_PASSWORD" "$HYPERDX_PASSWORD")
status=$(web_curl -s -o /dev/null -w '%{http_code}' -X POST "$web/api/register/password" \
    -H 'Content-Type: application/json' -d "$credentials")
case "$status" in
200) echo "HyperDX: registered $HYPERDX_EMAIL" ;;
409) echo 'HyperDX: account already exists' ;;
*)
    echo "HyperDX: registration answered $status"
    exit 1
    ;;
esac

token=${CLICKSTACK_ACCESS_KEY:-}
if [ -z "$token" ]; then
    jar=$(mktemp)
    web_curl -s -o /dev/null -c "$jar" -X POST "$web/api/login/password" \
        -H 'Content-Type: application/json' -d "$credentials"
    token=$(web_curl -s -b "$jar" "$web/api/me" | jq -r '.accessKey // empty')
    rm -f "$jar"
    if [ -z "$token" ]; then
        echo "HyperDX: no API access key for $HYPERDX_EMAIL"
        exit 1
    fi
fi

auth="Authorization: Bearer $token"
api_curl() { curl -sf -H "$auth" "$@"; }
named_ids() { jq -c '[.data[] | {(.name): .id}] | add // {}'; }

sources=$(api_curl "$api/sources" | named_ids)
connections=$(api_curl "$api/connections" | named_ids)
dashboards=$(api_curl "$api/dashboards" | named_ids)

# The image writes its own defaults the first time a team is created and never
# revisits them, so a stack that already has them keeps whatever it was given.
# Both lists are applied here instead, which is what makes a restart heal a
# connection whose password no longer matches, or a source pointing at a table
# the schema does not create.
send() {
    status=$(printf '%s' "$3" | curl -s -o /tmp/answer -w '%{http_code}' -X "$1" \
        -H "$auth" -H 'Content-Type: application/json' --data-binary @- "$api/$2")
    if [ "$status" != '200' ]; then
        echo "HyperDX: $2 answered $status: $(jq -c '.message // .' /tmp/answer)"
        exit 1
    fi
}

if [ -n "${DEFAULT_CONNECTIONS:-}" ]; then
    connection=$(printf '%s' "$DEFAULT_CONNECTIONS" | jq -c '.[0]')
    name=$(printf '%s' "$connection" | jq -r '.name')
    id=$(printf '%s' "$connections" | jq -r --arg name "$name" '.[$name] // empty')
    if [ -n "$id" ]; then
        # The API never returns a stored password, so the value is written on
        # every start rather than compared.
        send PUT "connections/$id" "$connection"
        echo "HyperDX: applied connection $name"
    fi
fi

if [ -n "${DEFAULT_SOURCES:-}" ]; then
    printf '%s' "$DEFAULT_SOURCES" | jq -c '.[]' >/tmp/sources.jsonl

    # The environment names its references, the API wants ids. A reference that
    # does not resolve yet is dropped here and written by the second pass, once
    # every source exists.
    resolve='(if .connection then .connection = ($connections[.connection] // .connection) else . end)
        | (if .logSourceId then .logSourceId = ($sources[.logSourceId] // empty) else . end)
        | (if .traceSourceId then .traceSourceId = ($sources[.traceSourceId] // empty) else . end)
        | (if .sessionSourceId then .sessionSourceId = ($sources[.sessionSourceId] // empty) else . end)
        | (if .metricSourceId then .metricSourceId = ($sources[.metricSourceId] // empty) else . end)
        | with_entries(select(.value != null and .value != ""))'

    # A source the stack lost is created first, so the ids below can name it.
    while read -r source; do
        name=$(printf '%s' "$source" | jq -r '.name')
        id=$(printf '%s' "$sources" | jq -r --arg name "$name" '.[$name] // empty')
        if [ -z "$id" ]; then
            send POST 'sources' "$(printf '%s' "$source" | jq -c \
                --argjson connections "$connections" --argjson sources "$sources" "$resolve")"
            echo "HyperDX: created source $name"
        fi
    done </tmp/sources.jsonl

    sources=$(api_curl "$api/sources" | named_ids)
    while read -r source; do
        name=$(printf '%s' "$source" | jq -r '.name')
        id=$(printf '%s' "$sources" | jq -r --arg name "$name" '.[$name] // empty')
        body=$(printf '%s' "$source" | jq -c \
            --argjson connections "$connections" --argjson sources "$sources" "$resolve")
        stored=$(api_curl "$api/sources/$id" | jq -c '.data')
        send PUT "sources/$id" "$(printf '%s' "$stored" | jq -c --argjson body "$body" '. + $body | del(.id)')"
        echo "HyperDX: applied source $name"
    done </tmp/sources.jsonl
fi

# The files name their source and connection, because the ids HyperDX assigns
# are regenerated whenever the stack is recreated. The API compares those
# fields against `_id`, so the names are resolved here, and an unknown name
# fails the run instead of provisioning a dashboard with a dangling reference.
# `tiles` and `filters` map a name to the id it already has, so an update keeps
# it; two entries sharing a name are left to the API, which mints fresh ids.
filter='
def id_of($table; $kind):
  if . == null then . else ($table[.] // error("unknown \($kind) \(.)")) end;

.tiles |= map(
  (if .config.source then .config.sourceId = (.config.source | id_of($sources; "source")) else . end)
  | del(.config.source)
  | (if .config.connection then .config.connectionId = (.config.connection | id_of($connections; "connection")) else . end)
  | del(.config.connection)
  | (if $tiles[.name] then .id = $tiles[.name] else del(.id) end)
)
| (if .filters then
    .filters |= map(
      (if .source then .sourceId = (.source | id_of($sources; "source")) else . end)
      | del(.source)
      | (if $filters[.name] then .id = $filters[.name] else del(.id) end)
    )
  else . end)
'

for file in "$dir"/*.json; do
    name=$(jq -r '.name' "$file")
    id=$(printf '%s' "$dashboards" | jq -r --arg name "$name" '.[$name] // empty')
    if [ -n "$id" ]; then
        mode=update
        method=PUT
        url="$api/dashboards/$id"
        stored=$(api_curl "$url")
        tiles=$(printf '%s' "$stored" | jq -c '[.data.tiles[]]
      | group_by(.name)
      | map(select(length == 1) | {(.[0].name): .[0].id})
      | add // {}')
        filters=$(printf '%s' "$stored" | jq -c '[(.data.filters // [])[]]
      | group_by(.name)
      | map(select(length == 1) | {(.[0].name): .[0].id})
      | add // {}')
    else
        mode=create
        method=POST
        url="$api/dashboards"
        tiles='{}'
        filters='{}'
    fi

    body=$(jq -c --argjson sources "$sources" \
        --argjson connections "$connections" --argjson tiles "$tiles" \
        --argjson filters "$filters" "$filter" "$file") || {
        echo "HyperDX: $file could not be prepared"
        exit 1
    }

    # The validator answers for the create shape only, where a filter carries no id.
    check=$(printf '%s' "$body" | jq -c 'if .filters then .filters |= map(del(.id)) else . end' |
        curl -s -X POST -H "$auth" -H 'Content-Type: application/json' \
            --data-binary @- "$api/dashboards/validate")
    if [ "$(printf '%s' "$check" | jq -r '.valid')" != 'true' ]; then
        echo "HyperDX: $name is invalid: $(printf '%s' "$check" | jq -c '.errors')"
        exit 1
    fi

    status=$(printf '%s' "$body" | curl -s -o /tmp/answer -w '%{http_code}' -X "$method" \
        -H "$auth" -H 'Content-Type: application/json' --data-binary @- "$url")
    if [ "$status" != '200' ]; then
        echo "HyperDX: $name answered $status: $(jq -c '.message // .' /tmp/answer)"
        exit 1
    fi
    echo "HyperDX: provisioned $name"
done

# A dashboard this repository no longer ships is removed, so a renamed file does
# not leave its old copy behind. The `edgy` tag scopes the sweep: a dashboard
# created by hand on the same instance carries no such tag and is left alone.
names=$(for file in "$dir"/*.json; do jq -r '.name' "$file"; done | jq -R . | jq -sc .)
api_curl "$api/dashboards" |
    jq -r --argjson names "$names" '
        .data[]
        | select((.tags // []) | index("edgy"))
        | select(.name as $name | $names | index($name) | not)
        | "\(.id) \(.name)"' >/tmp/stale.txt
while read -r id name; do
    status=$(curl -s -o /tmp/answer -w '%{http_code}' -X DELETE -H "$auth" "$api/dashboards/$id")
    if [ "$status" != '200' ]; then
        echo "HyperDX: $name could not be removed: $(jq -c '.message // .' /tmp/answer)"
        exit 1
    fi
    echo "HyperDX: removed $name"
done </tmp/stale.txt
