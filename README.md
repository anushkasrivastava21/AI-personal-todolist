# ✨ AI Todo — Personal Productivity Dashboard

> An AI-powered productivity dashboard with smart task breakdown, Pomodoro timer, habit tracking, and a conversational AI assistant — all in a sleek, modern interface.

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white)

---

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Database Setup](#database-setup)
  - [Environment Variables](#environment-variables)
  - [Running the App](#running-the-app)
- [API Endpoints](#-api-endpoints)
- [Usage Guide](#-usage-guide)
- [Screenshots](#-screenshots)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🚀 Features

### 📝 Smart Task Management
- Create, edit, delete, and reorder tasks via drag-and-drop
- **Subtask nesting** — break tasks into smaller pieces manually
- **AI Task Breakdown** — powered by **Google Gemini**, automatically decomposes complex tasks into actionable subtasks
- Points, workload, deadlines, tags, and estimated time per task
- Filter tasks by status (All / Pending / Completed)
- Workload-based progress tracking (not just task count)

### 🔄 Daily & Recurring Tasks
- Create daily recurring tasks with time-of-day scheduling (Morning / Afternoon / Evening)
- Weekly recurring tasks with specific day selection (e.g., Mon, Wed, Fri)
- Streak tracking with fire 🔥 badges
- Auto-reset daily completions each day

### ⏱️ Pomodoro Timer
- Circular animated countdown timer
- Configurable focus, short break, and long break durations
- Session tracking (e.g., Session 1 of 4)
- Link timer sessions to specific tasks
- Manual break triggers
- Daily focus time statistics

### 🌱 Habit Builder
- Create habits with daily or weekly frequency
- **Measurable habits** — track progress against numeric goals (e.g., read 30 pages)
- **Streak tracking** with best-streak records
- **GitHub-style contribution heatmap** for visualizing consistency
- Weekly progress bar charts
- Streak timeline visualization
- **AI Habit Coach** — generates progressive scaling plans (e.g., gradually increasing daily reading pages)
- Milestone celebrations

### 🤖 AI Assistant (Chat Interface)
- Conversational AI powered by **Google Gemini**
- Natural language task creation — e.g., *"Add a task to buy groceries tomorrow"*
- Recurring task scheduling — e.g., *"Schedule gym on Monday, Wednesday, and Friday evenings"*
- Task queries — e.g., *"What tasks do I have today?"*
- Quick suggestion chips for common actions

### 📅 Calendar
- Interactive mini calendar in the task sidebar
- Full-screen calendar view with monthly navigation
- Click any date to view tasks scheduled or due on that day
- Visual indicators for dates with tasks

### ⚙️ Settings
- Securely store your Gemini API key in the browser's LocalStorage
- Key is **never** committed to version control

---

## 🛠️ Tech Stack

| Layer          | Technology                                                                    |
|----------------|-------------------------------------------------------------------------------|
| **Frontend**   | Vanilla HTML, CSS, JavaScript                                                 |
| **Icons**      | [Phosphor Icons](https://phosphoricons.com/)                                  |
| **Fonts**      | [Inter](https://fonts.google.com/specimen/Inter) + [Outfit](https://fonts.google.com/specimen/Outfit) (Google Fonts) |
| **Backend**    | [Node.js](https://nodejs.org/) + [Express](https://expressjs.com/)           |
| **Database**   | [PostgreSQL](https://www.postgresql.org/)                                     |
| **ORM**        | [Prisma](https://www.prisma.io/)                                              |
| **Auth**       | JWT ([jsonwebtoken](https://www.npmjs.com/package/jsonwebtoken)) + [bcrypt](https://www.npmjs.com/package/bcrypt) |
| **AI**         | [Google Gemini API](https://ai.google.dev/) (`@google/generative-ai`)        |
| **Storage**    | Browser LocalStorage (frontend-side tasks, habits, settings)                  |

---

## 📁 Project Structure

```
AI-Todo-List/
├── index.html              # Main SPA — all screens rendered here
├── style.css               # Full application styles (glassmorphism, animations, responsive)
├── script.js               # Frontend logic — tasks, pomodoro, habits, AI, calendar (~2200 lines)
├── package.json            # Root monorepo config (npm workspaces)
├── .env                    # Root-level Gemini API key
├── .gitignore              # Ignores .env and node_modules
│
└── server/                 # Express backend (REST API)
    ├── index.js            # Server entry point — Express app setup
    ├── package.json        # Server dependencies
    ├── .env                # Server environment variables (DB, JWT, API keys)
    ├── prisma/
    │   ├── schema.prisma   # Database schema (Users, Workspaces, Tasks)
    │   └── client.js       # Prisma client singleton
    ├── routes/
    │   ├── auth.js         # POST /register, POST /login, GET /me
    │   └── tasks.js        # Full CRUD for tasks with subtask support
    └── middleware/
        └── authMiddleware.js  # JWT verification middleware
```

---

## 🏁 Getting Started

### Prerequisites

- **Node.js** v18+ — [Download](https://nodejs.org/)
- **PostgreSQL** — [Download](https://www.postgresql.org/download/)
- **Google Gemini API Key** — [Get one here](https://aistudio.google.com/apikey)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/anushkasrivastava21/AI-personal-todolist.git
cd AI-personal-todolist

# 2. Install all dependencies (root + server workspace)
npm install
```

### Database Setup

```bash
# 1. Make sure PostgreSQL is running

# 2. Create the database
psql -U postgres -c "CREATE DATABASE todo_db;"

# 3. Run Prisma migrations
npm run db:migrate
```

### Environment Variables

Create a `.env` file inside the `server/` directory:

```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/todo_db?schema=public"
JWT_SECRET="your-secret-key-change-in-production"
GEMINI_API_KEY="your-gemini-api-key"
PORT=5000
```

> ⚠️ **Important:** Never commit your `.env` file. It's already listed in `.gitignore`.

### Running the App

```bash
# Start the backend server (with auto-reload via nodemon)
npm run dev:server
```

Then open `index.html` directly in your browser, or serve it with any static file server:

```bash
# Option: Use a simple static server
npx serve .
```

The backend runs on `http://localhost:5000` by default.

---

## 📡 API Endpoints

### Authentication

| Method | Endpoint            | Description                | Auth Required |
|--------|---------------------|----------------------------|:-------------:|
| POST   | `/api/auth/register`| Register a new user        | ❌            |
| POST   | `/api/auth/login`   | Login and receive JWT      | ❌            |
| GET    | `/api/auth/me`      | Get current user profile   | ✅            |

### Tasks

| Method | Endpoint          | Description                                         | Auth Required |
|--------|-------------------|-----------------------------------------------------|:-------------:|
| GET    | `/api/tasks`      | Get all tasks (filter by workspace, status, date)   | ✅            |
| GET    | `/api/tasks/:id`  | Get a single task with subtasks                     | ✅            |
| POST   | `/api/tasks`      | Create a new task or subtask                        | ✅            |
| PUT    | `/api/tasks/:id`  | Update task properties                              | ✅            |
| DELETE | `/api/tasks/:id`  | Delete a task (cascades to subtasks)                | ✅            |

### Health Check

| Method | Endpoint   | Description          |
|--------|------------|----------------------|
| GET    | `/health`  | Server health status |

---

## 📖 Usage Guide

### Adding a Task
1. Type your task in the input field on the **Tasks** screen
2. Click the **⚙ sliders** icon to expand options (points, workload, deadline, tags, estimated time)
3. Press the **+** button or hit Enter to add

### AI Task Breakdown
1. Type a complex task — e.g., *"Plan a birthday party"*
2. Click the **✨ sparkle** button
3. Gemini will generate 3-5 subtasks and nest them under a parent task

### Pomodoro Timer
1. Navigate to the **Pomodoro** tab
2. Optionally link a task from the dropdown
3. Press **Play** to start a 25-minute focus session
4. Customize durations via **Timer Settings**

### Building Habits
1. Go to the **Habits** tab → click **+ New Habit**
2. Set frequency, target type, and optionally use the **AI Habit Coach** to generate a progressive plan
3. Check in daily from the Habits screen or directly from the Tasks view

### AI Assistant
1. Open the **AI Assistant** tab
2. Type natural language commands or use the suggestion chips
3. The assistant can create tasks, set recurring schedules, and answer queries about your task list

---

## 🖼️ Screenshots

> *Coming soon — contributions welcome!*

---

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. **Fork** the repository
2. Create a **feature branch** (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. Open a **Pull Request**

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

---

<p align="center">
  Built with ❤️ by <strong>Anushka</strong>
</p>
