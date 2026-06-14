# Repoverse

> AI-Powered GitHub Repository Visualization & Gamified Code Remediation Platform

---

## Overview

**Repoverse 3D City** is an AI-powered repository analysis platform that transforms GitHub repositories into an interactive 3D city. Each file in a repository is represented as a building, allowing developers to visualize project structure, identify problematic code, and resolve issues through an engaging gamified experience.

The platform uses **GitHub APIs** to analyze repository contents and **Azure AI Services** to detect bugs, security vulnerabilities, performance issues, and code quality concerns. Files containing issues are highlighted with visual indicators such as rooftop fire effects, enabling developers to quickly locate and prioritize fixes.

Once issues are identified, developers can become a **City Hero** by completing challenges and applying AI-generated code fixes directly to their repositories.

---

## Features

| Feature                     | Description                                                         |
| --------------------------- | ------------------------------------------------------------------- |
| AI Repository Analysis      | Analyze GitHub repositories using GitHub APIs and Azure AI Services |
| 3D City Visualization       | Convert repository files into interactive 3D buildings              |
| Bug Severity Classification | Categorize issues into Critical, High, Major, and Minor levels      |
| Visual Issue Indicators     | Display fire and warning effects on buildings with issues           |
| Detailed AI Reports         | View issue descriptions, root causes, and remediation suggestions   |
| Become a City Hero          | Gamified issue resolution workflow                                  |
| Interactive Challenges      | Math Challenge, Quiz Challenge, and Snake Game                      |
| AI-Powered Fix Suggestions  | Generate secure and optimized code fixes using Azure AI             |
| GitHub Commit Integration   | Commit AI-generated fixes directly to GitHub                        |
| Pull Request Creation       | Create pull requests without leaving the platform                   |
| Automatic City Refresh      | Rebuild and update the city after issues are resolved               |

---

## How It Works

### 1. Repository Analysis

* User submits a GitHub repository URL.
* GitHub API retrieves repository structure and source files.
* Azure AI analyzes all files for:

  * Code Quality Issues
  * Security Vulnerabilities
  * Performance Problems
  * Maintainability Concerns

### 2. Issue Classification

Detected issues are categorized into:

* 🔴 Critical
* 🟠 High
* 🟡 Major
* 🔵 Minor

### 3. 3D City Construction

* Every file becomes a building.
* Repository structure is visualized as a city.
* Buildings containing issues display rooftop fire and warning effects.

### 4. Issue Investigation

Clicking a building displays:

* Issue Severity
* Issue Description
* Root Cause Analysis
* Impact Assessment
* AI Recommendations

### 5. Become a City Hero

Users can unlock issue remediation by completing one challenge:

* ➗ Math Challenge
* ❓ Quiz Challenge
* 🐍 Snake Game

### 6. AI-Powered Resolution

After completing a challenge:

* Azure AI generates fix recommendations.
* Optimized code is provided.
* Users can copy or apply fixes directly.

### 7. GitHub Integration

* Commit code changes.
* Create Pull Requests.
* Merge fixes into the repository.

### 8. City Regeneration

After merge:

* Repository is re-analyzed.
* Fixed buildings are updated.
* Fire indicators disappear.
* Repository health improves visually.

---

## Tech Stack

| Layer                 | Technology         |
| --------------------- | ------------------ |
| Frontend              | JavaScript         |
| Visualization         | 3D Repository City |
| AI Analysis           | Azure AI Services  |
| AI Orchestration      | Azure AI Foundry   |
| Repository Management | GitHub API         |
| Issue Detection       | Azure AI Models    |
| Code Review           | Azure AI Services  |
| Version Control       | GitHub API         |
| Deployment            | Vercel             |

---

## Architecture

```text
GitHub Repository
        │
        ▼
GitHub API Analysis
        │
        ▼
Azure AI File Analysis
        │
        ▼
Issue Classification
(Critical / High / Major / Minor)
        │
        ▼
3D City Generation
        │
        ▼
Issue Visualization
(Fire & Error Indicators)
        │
        ▼
Become a City Hero
        │
        ▼
Challenge Completion
(Math / Quiz / Snake)
        │
        ▼
Azure AI Code Review
        │
        ▼
Fix Generation
        │
        ▼
GitHub Commit & PR
        │
        ▼
Repository Re-analysis
        │
        ▼
Updated 3D City
```

---

## Key Technologies Used

* JavaScript
* Azure AI Foundry
* Azure AI Services
* GitHub API
* Vercel
* 3D Visualization Engine

---

## 🎥 Demo Video
 
Watch RepoVerse 3D City in action:
 
[![RepoVerse 3D City Demo](https://img.shields.io/badge/Watch-Demo%20Video-red?style=for-the-badge&logo=youtube)](https://youtu.be/AIVEsidraEQ)
 
Direct Link: https://youtu.be/AIVEsidraEQ

---

Built with ❤️ using Azure AI Foundry, Azure AI Services, GitHub APIs, and JavaScript.
