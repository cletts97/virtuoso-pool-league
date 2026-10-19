# Codex Instructions — Virtuoso Pool League

## Project Context

You are developing Virtuoso Pool League, a web application for managing an office pool competition.

Read `PROJECT.md` before making architectural decisions or implementing substantial features.

Treat `PROJECT.md` as the primary source of product requirements.

## Working Style

- Act as an experienced full-stack software engineer.
- Produce production-quality, readable, maintainable code.
- Favor simple solutions over unnecessary abstractions.
- Make sensible implementation decisions without repeatedly asking trivial questions.
- Ask before changing business rules, choosing major infrastructure components, or introducing substantial recurring costs.
- Explain significant technical decisions in plain English.
- Do not introduce unrelated features.
- Work incrementally rather than implementing the entire application in one step.

## Technology

Use the technology stack defined in `PROJECT.md`.

Prefer:
- TypeScript with strict type checking.
- React functional components and hooks.
- Tailwind CSS for styling.
- Reusable UI components.
- Clear separation between presentation, business logic, and data access.
- Server-side validation and authorization for protected actions.

Avoid introducing additional frameworks without a clear benefit.

## Coding Standards

- Use consistent naming and folder conventions.
- Keep components reasonably small and focused.
- Avoid duplicated business logic.
- Use meaningful variable and function names.
- Handle loading, empty, and error states.
- Use appropriate error handling and logging.
- Avoid hardcoded secrets, credentials, URLs, and environment-specific configuration.
- Add comments for non-obvious logic rather than explaining every line.
- Prefer established, actively maintained dependencies.

## League Business Rules

- Implement league rules according to `PROJECT.md`.
- Keep standings calculations centralized and testable.
- Only confirmed results affect standings.
- Enforce score validation according to the match format.
- Prevent the same result being counted more than once.
- Preserve historical results when making corrections.
- Ensure postponed fixtures do not become automatic defeats without administrative intervention.

## Security

- Never trust client-side validation alone.
- Validate API requests.
- Enforce authentication and authorization server-side.
- Never expose database credentials or privileged API keys in the frontend.
- Do not rely on email links as proof of identity.
- Apply least-privilege access.
- Keep secrets outside source control.
- Never commit `.env` files containing credentials.

## User Interface

- Aim for a polished, modern sports application rather than an administrative spreadsheet.
- Prioritize mobile responsiveness.
- Maintain consistent spacing, typography, and visual hierarchy.
- Support accessible keyboard interactions and semantic HTML.
- Use mock data where necessary during early frontend development.
- Avoid overly complex animations.
- Use a consistent visual design system.

## Testing

- Add automated tests for important business logic.
- Particularly test fixture generation, league standings, score validation, and approval workflows.
- Run available linting, type checking, and tests after relevant changes.
- Report which checks passed and which could not be run.
- Never claim tests passed unless they were actually executed.

## Development Workflow

Before substantial work:
1. Review relevant existing files.
2. Identify dependencies and likely impact.
3. Present a short implementation plan when the task is complex.
4. Implement the requested change.
5. Run appropriate validation.
6. Summarize changes and any outstanding work.

Do not:
- Rewrite unrelated areas of the application.
- Install unnecessary packages.
- Delete working functionality without explanation.
- Change agreed business rules silently.
- Commit or push changes unless explicitly requested.
- Deploy infrastructure or incur cloud costs without permission.

## Documentation

- Keep `PROJECT.md` aligned with agreed requirements.
- Update `README.md` as setup and deployment processes become established.
- Document required environment variables without including secret values.
- Record material architectural decisions where appropriate.

## Communication

Assume the project owner is technically experienced with Azure, infrastructure, Git, and automation, but is less experienced with modern React development.

Explain important frontend or full-stack concepts when useful.

Be concise, practical, and proactive in identifying risks or better implementation approaches.
