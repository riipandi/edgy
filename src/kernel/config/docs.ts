import { flag, group, type ValueOf } from './field.ts'

export const docsConfig = group(
  {
    enabled: flag(
      'API_DOCS_ENABLED',
      false,
      'Expose the OpenAPI document and the Scalar API reference for the API'
    )
  },
  'Docs'
)

export type DocsConfig = ValueOf<typeof docsConfig>
