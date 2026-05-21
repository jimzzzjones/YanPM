# YanPM Privacy Notice Draft

YanPM uses language input and AI assistance to manage projects. This draft is for the first Web release and should be reviewed before publication.

## Data collected

- Account identity: WeChat Open Platform ID, Enterprise WeChat ID, nickname, avatar.
- Real-name profile: real name, organization/team, mobile number or enterprise email.
- Project data: project names, milestones, tasks, risks, decisions, reports, members.
- Language input: meeting notes, chat records, daily updates, uploaded file names, recording source notes.
- Audit logs: operator, action, project, timestamp, action detail, import/export events.
- AI settings: model provider configuration stored by the server; API keys must not be exposed to the browser in production.

## Purpose

- Authenticate users and identify project operators.
- Generate task, risk, decision, report, and audit records.
- Provide traceability for AI-assisted and human-confirmed changes.
- Support compliance review, issue rollback, and team accountability.

## Storage and retention

- Local MVP: data is stored in browser storage and/or `data/state.json`.
- Production release: data should be stored in a backend database with access control and backups.
- Audit logs should be retained according to the organization policy and protected from ordinary user modification.

## AI processing

Project text may be sent to the configured AI provider through the YanPM backend proxy. Production deployments should disclose the selected AI provider and avoid sending sensitive content to unapproved providers.

## User controls

- Users can view project memory and audit records in the app.
- Administrators should be able to export audit records.
- Production release should provide account binding, data export, and deletion request workflows.

## Contact

Provide a business contact, privacy contact, and security contact before public release.
