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

# The files name their source and connection, because the ids HyperDX assigns
# are regenerated whenever the stack is recreated. The API compares those
# fields against `_id`, so the names are resolved here, and an unknown name
# fails the run instead of provisioning a dashboard with a dangling reference.
# `tiles` maps a tile name to the id it already has, so an update keeps it;
# two tiles sharing a name are left to the API, which mints fresh ids.
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
      | (if $mode == "create" then del(.id) else . end)
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
        tiles=$(api_curl "$url" | jq -c '[.data.tiles[]]
      | group_by(.name)
      | map(select(length == 1) | {(.[0].name): .[0].id})
      | add // {}')
    else
        mode=create
        method=POST
        url="$api/dashboards"
        tiles='{}'
    fi

    body=$(jq -c --arg mode "$mode" --argjson sources "$sources" \
        --argjson connections "$connections" --argjson tiles "$tiles" "$filter" "$file") || {
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
