# ProjectTemplate

**A reusable development template for AI-assisted software projects.**

ProjectTemplate is a centralized collection of AI coding agent instructions, reusable skills, development guidelines, and curated resources designed to streamline project initialization and maintain consistency across different projects.

Instead of repeatedly configuring agents, installing skills, and organizing development references whenever starting something new, this repository provides a reusable foundation that can be adapted to each project's requirements.

## Overview

The purpose of ProjectTemplate is simple: **configure once, reuse across projects.**

Whether developing web applications, interactive portfolios, dashboards, or other software solutions, this template helps establish a consistent AI-assisted development workflow without rebuilding the same configuration from scratch.

It focuses on developer productivity, organized instructions, reusable knowledge, and flexibility rather than enforcing a particular technology stack.

## Key Features

- **Reusable AI Agent Instructions** — Centralized guidance for AI coding assistants to follow consistent development practices.
- **Preconfigured Skills** — Reusable skills that support specialized development tasks and workflows.
- **Claude Configuration** — Dedicated configuration directory for Claude-compatible development workflows.
- **Curated Development Resources** — Organized references for UI libraries, animations, charts, 3D technologies, and visual assets.
- **Skill Tracking** — A lockfile for recording installed skills and their source information.
- **Flexible Project Setup** — Adaptable to different application types, frameworks, and technology stacks.
- **Consistent Development Practices** — Encourages maintainability, accessibility, responsiveness, and responsible dependency selection.
- **Reduced Repetitive Setup** — Keeps commonly used configurations in one reusable repository.

## Repository Structure

| File / Directory | Purpose |
|---|---|
| `.agents/skills/` | Reusable AI agent skills and specialized instructions. |
| `.claude/` | Claude-specific configuration files. |
| `AGENTS.md` | Shared instructions that guide compatible AI coding agents. |
| `RESOURCES.md` | Curated development resources, libraries, tools, and implementation guidelines. |
| `skills-lock.json` | Tracks installed skills, their sources, and associated metadata. |
| `commit-msg.txt` | Reference file for commit messages. |

## Getting Started

### 1. Create a New Project

Clone this repository into a new directory:

```bash
git clone https://github.com/Kaylooww/ProjectTemplate.git my-new-project
cd my-new-project
```

Remove the original repository's remote connection:

```bash
git remote remove origin
```

You can then connect the directory to a new GitHub repository using your own remote URL.

Alternatively, enable GitHub's **Template repository** option in the repository settings to create new repositories directly from this template.

### 2. Configure Your Project

After creating your project:

1. Define the project's goals, requirements, and intended technology stack.
2. Update `AGENTS.md` with project-specific development instructions.
3. Review the existing skills and retain only those relevant to the project.
4. Customize `RESOURCES.md` when additional references are needed.
5. Add the required application files and dependencies.
6. Configure any additional AI tools according to their supported instruction and skill formats.

**Important:** This repository provides development configurations and references, not a fully initialized application. Frameworks and dependencies should be installed according to the new project's needs.

### 3. Start AI-Assisted Development

Open the project in your preferred development environment and initialize your AI coding assistant.

A recommended starting instruction is:

> Read AGENTS.md and RESOURCES.md, inspect the available agent skills and existing project files, and understand the project's conventions before making changes. Reuse existing resources when appropriate, avoid unnecessary dependencies, and follow the project's requirements.

The way instructions and skills are discovered depends on the AI assistant being used. Ensure that the relevant configuration paths are supported by your chosen tool.

## Development Resources

The `RESOURCES.md` file contains a curated collection of technologies and references commonly used in modern application development.

| Category | Resources |
|---|---|
| UI Components | shadcn/ui, React Bits, 21st.dev, Uiverse, Ant Design |
| Animations | Motion, Anime.js |
| Charts | shadcn/ui Charts, Bklit, TradingView Lightweight Charts |
| 3D Development | Three.js, React Three Fiber, Drei |
| Interactive Graphics | Rive |
| Icons | Lucide |
| Visual References | Prompt Motion |

These are references rather than required dependencies.

**Resource selection principles:**

- Prefer existing project dependencies before introducing new ones.
- Select libraries based on actual requirements.
- Consult official documentation when available.
- Consider performance, accessibility, compatibility, licensing, and maintainability.
- Avoid adding multiple libraries that perform the same function without a clear reason.
- Optimize 3D assets and animations for different devices.
- Review external resources before integrating them.

## AI Agent Skills

The repository supports reusable skills for AI-assisted development.

Skills provide specialized instructions that can help coding assistants follow particular workflows or development practices.

The existing `skills-lock.json` tracks the `design-taste-frontend` skill sourced from `Leonxlnx/taste-skill`.

Skills can be expanded or updated as development needs evolve.

For reliable reuse:

1. Keep skill instructions organized.
2. Verify compatibility with the chosen AI assistant.
3. Avoid retaining unnecessary or conflicting skills.
4. Review changes when updating externally sourced skills.
5. Maintain the relevant skill metadata where applicable.

## Recommended Development Workflow

**1. Understand** — Review project requirements, existing code, instructions, and available skills.

**2. Plan** — Identify the necessary features, architecture, dependencies, and implementation approach.

**3. Develop** — Implement features incrementally using established conventions and reusable resources.

**4. Validate** — Review functionality, code quality, responsiveness, accessibility, and potential issues.

**5. Document** — Keep project documentation and configuration instructions aligned with the implementation.

**6. Improve** — Refine reusable instructions and skills when improvements can benefit future projects.

## Design Principles

ProjectTemplate promotes the following principles:

- **Reusability:** Avoid rebuilding configurations and workflows unnecessarily.
- **Consistency:** Maintain predictable conventions across projects.
- **Simplicity:** Prefer practical solutions over unnecessary complexity.
- **Modularity:** Keep components, instructions, and configurations organized.
- **Flexibility:** Adapt to the requirements of each individual project.
- **Maintainability:** Produce readable, testable, and sustainable code.
- **Accessibility:** Consider different users, devices, and interaction needs.
- **Performance:** Prioritize efficient implementations and responsible resource usage.

## Customization

This repository is intended to evolve.

You can add new skills, improve AI agent instructions, reorganize resource references, introduce new development workflows, or remove configurations that are unnecessary for a particular project.

Changes made to a new project do not automatically update the original template. Reusable improvements should be intentionally incorporated into this repository when appropriate.

## Project Goals

- Minimize repetitive AI development setup.
- Maintain a central collection of reusable agent instructions and skills.
- Improve consistency across software projects.
- Accelerate project initialization.
- Encourage efficient, maintainable, and organized development.
- Support continuous improvement of AI-assisted coding workflows.

## Maintainer

**Kyle Angelo C. Castro**

GitHub: [@Kaylooww](https://github.com/Kaylooww)

---

**ProjectTemplate — Configure once. Build consistently. Reuse everywhere.**
