import { group, secret, text, flag, port, type ValueOf } from './field.ts'

export const mailerConfig = group(
  {
    fromEmail: text('MAILER_FROM_EMAIL', 'mailer@example.com', 'Default sender email address'),
    fromName: text('MAILER_FROM_NAME', 'Edgy Mailer', 'Default sender display name'),
    smtpHost: text('MAILER_SMTP_HOST', 'localhost', 'SMTP server host'),
    smtpPort: port('MAILER_SMTP_PORT', 1025, 'SMTP server port'),
    smtpUsername: text('MAILER_SMTP_USERNAME', 'maileruser1', 'SMTP authentication username'),
    smtpPassword: secret('MAILER_SMTP_PASSWORD', 'mailerpass1', 'SMTP authentication password'),
    smtpSecure: flag('MAILER_SMTP_SECURE', false, 'Use TLS for the SMTP connection')
  },
  'Mailer'
)

export type MailerConfig = ValueOf<typeof mailerConfig>
