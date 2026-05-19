# Contributing

## Branching

- Keep `main` deployable.
- Create short-lived feature branches from `main`.
- Open a pull request early for visibility.

## Pull requests

- Fill out the PR template fully.
- Keep PRs focused and reviewable.
- Include screenshots for UI changes.
- Note risk and rollback plan in every PR.

## Local quality checks

Run before opening a PR:

```bash
npm run lint
npm run typecheck
npm run build
```

## Commit style

- Use clear commit messages that explain intent.
- Avoid mixing unrelated changes in one commit.

## Security and secrets

- Never commit `.env` files or credentials.
- Use `.env.example` for required keys with placeholders.
