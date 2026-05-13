# Felectra Intern Onboarding Guide 🚀

Welcome to the Felectra Internship Program.

This document will help you set up your development environment and get access to the tools used by the team.

---

# 1. Create Required Accounts

Please create the following accounts before starting development.

## GitHub
Create account:
https://github.com/

## Notion
Create account:
https://www.notion.so/

## Discord or Slack (if applicable)
Team communication platform details will be shared separately.

---

# 2. Share Your Details

After creating the accounts, please share the following details with the team lead/admin.

## Required Information
- Full Name
- Email Address
- GitHub Username
- Notion Email ID

Example:

```text
Name: John Doe
GitHub: johndoe
Notion Email: johndoe@gmail.com
```

This will be used to provide:

* Repository access
* Notion workspace access
* Project collaboration permissions

---

# 3. Install Required Software

## Install VS Code

Download:
[https://code.visualstudio.com/](https://code.visualstudio.com/)

## Install Node.js

Download LTS version:
[https://nodejs.org/](https://nodejs.org/)

Verify installation:

```bash
node -v
npm -v
```

## Install Git

Download:
[https://git-scm.com/](https://git-scm.com/)

Verify installation:

```bash
git --version
```

---

# 4. Install Recommended VS Code Extensions

Open VS Code → Extensions

Install:

* ESLint
* Prettier
* GitLens
* Tailwind CSS IntelliSense
* Thunder Client
* Error Lens

---

# 5. Clone the Repository

Once access is provided:

```bash
git clone <REPOSITORY_URL>
```

Example:

```bash
git clone https://github.com/felectra/felectra.git
```

Move into the project:

```bash
cd felectra
```

---

# 6. Install Project Dependencies

We use `pnpm` for package management.

## Install pnpm

```bash
npm install -g pnpm
```

Verify:

```bash
pnpm -v
```

Install dependencies:

```bash
pnpm install
```

---

# 7. Open the Project

Open VS Code inside the project:

```bash
code .
```

---

# 8. Git Workflow

## Create New Branch

```bash
git checkout -b feature/your-feature-name
```

Example:

```bash
git checkout -b feature/playwright-research
```

## Commit Changes

```bash
git add .
git commit -m "Added initial Playwright setup"
```

## Push Changes

```bash
git push origin feature/your-feature-name
```

---

# 9. Daily Workflow Expectations

Each day:

* Pull latest changes
* Update your task progress
* Commit code regularly
* Document findings
* Ask questions if blocked

---

# 10. Project Structure Overview

```text
felectra/
├── apps/
├── packages/
├── docs/
├── infra/
└── turbo.json
```

## apps/

Contains individual applications.

## packages/

Shared reusable code and utilities.

## docs/

Documentation and onboarding guides.

## infra/

Infrastructure and deployment related files.

---

# 11. Current Internship Tasks

## Intern 1

Playwright WhatsApp Automation Research

## Intern 2

Puppeteer WhatsApp Automation Research

## Intern 3

Backend API & Message Organizer

---

# 12. Learning Resources

## JavaScript

[https://javascript.info/](https://javascript.info/)

## Playwright

[https://playwright.dev/](https://playwright.dev/)

## Puppeteer

[https://pptr.dev/](https://pptr.dev/)

## Node.js

[https://nodejs.org/en/learn](https://nodejs.org/en/learn)

## Git Basics

[https://learngitbranching.js.org/](https://learngitbranching.js.org/)

---

# 13. Important Notes

* Focus on learning and experimentation.
* It is okay to make mistakes.
* Document everything you discover.
* Ask questions early when blocked.
* Keep communication active.

---

# 14. First Day Goals

Complete:

* [ ] Install required software
* [ ] Create accounts
* [ ] Share account details
* [ ] Clone repository
* [ ] Run project locally
* [ ] Access Notion workspace
* [ ] Read assigned task
* [ ] Push first commit

---

# Welcome to Felectra 🚀

We are building real-world engineering systems with experimentation, ownership, and continuous learning.

Happy coding!
