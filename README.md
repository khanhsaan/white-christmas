# white-christmas

## Project Overview

**white-christmas** is a full-stack application for secure image protection, sharing, and decoding, featuring a modern web frontend, a high-performance backend, Supabase-managed storage and authentication, and a browser extension for enhanced user experience.

---

## Tech Stack

### Frontend
- **Framework:** Next.js (React, TypeScript)
- **Styling:** CSS Modules, PostCSS
- **State Management:** React Hooks
- **Location:** `WC_Web/white-christmas/`

### Backend
- **Framework:** FastAPI (Python)
- **Image Processing:** OpenCV, Pillow, numpy
- **Authentication & Security:** cryptography, python-dotenv
- **Supabase Integration:** supabase-py
- **Location:** `backend/`

### Database & Storage
- **Database:** Supabase (PostgreSQL)
- **Storage:** Supabase Storage Buckets
- **Location:** `supabase/`

### Browser Extension
- **Type:** Chrome Extension (Manifest V3)
- **Location:** `WC_plugin/`

### Tooling
- **Python venv:** For backend dependency isolation
- **Node.js & npm:** For frontend dependency management
- **ESLint/TypeScript:** For code quality and type safety
- **Dotenv:** For secure environment variable management

---

## Why These Technologies?

| Layer         | Technology         | Reason for Choice                                      |
|---------------|--------------------|--------------------------------------------------------|
| Frontend      | Next.js, React     | SSR, SEO, modern UI, large ecosystem                   |
| Styling       | CSS Modules, PostCSS| Scoped styles, modern CSS features                     |
| Backend       | FastAPI            | Async, type safety, auto docs, performance             |
| Auth/Security | cryptography, dotenv| Secure keys, config management                         |
| Image Proc.   | OpenCV, Pillow, numpy| Powerful, flexible image handling                      |
| Database      | Supabase (Postgres)| Managed, scalable, RLS, open source                    |
| Storage       | Supabase Buckets   | Secure, scalable file storage                          |
| Extension     | Chrome Manifest V3 | Browser integration                                    |
| Tooling       | venv, npm, ESLint  | Dependency isolation, code quality                     |

- **Full-Stack Type Safety:** TypeScript and Python type hints reduce runtime errors.
- **Modern, Scalable Architecture:** Next.js and FastAPI are high-performance, well-supported frameworks.
- **Rapid Development:** Supabase accelerates backend setup with managed auth, database, and storage.
- **Security:** Environment variables, cryptography, and Supabase RLS ensure data protection.
- **Extensibility:** Modular codebase (hooks, services, plugins) allows for easy feature expansion.
- **Cross-Platform:** Web app and browser extension reach users wherever they are.

---

## Getting Started

1. **Clone the repository:**
   ```
   git clone <repo-url>
   cd white-christmas
   ```
2. **Backend Setup:**
   - Create a Python 3.11 virtual environment:
     ```
     python3.11 -m venv venv
     source venv/bin/activate
     pip install -r backend/requirements.txt
     ```
   - Configure environment variables in `backend/.env.local`.
   - Run the backend:
     ```
     cd backend
     uvicorn main:app --reload --host 0.0.0.0 --port 8000
     ```
3. **Frontend Setup:**
   - Install dependencies and run the dev server:
     ```
     cd WC_Web/white-christmas
     npm install
     npm run dev
     ```
4. **Supabase Setup:**
   - See `supabase/SETUP.md` for instructions on initializing Supabase, running migrations, and configuring storage buckets.
5. **Browser Extension:**
   - See `WC_plugin/README.md` for extension usage and installation.

---

## License

MIT