import { flag, group } from './field.ts'

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
