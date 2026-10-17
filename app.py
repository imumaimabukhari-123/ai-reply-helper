"""
AI Reply Helper: select a message on any website and get 3 ready-to-send replies.

Run:   python app.py
Open:  http://127.0.0.1:8005

Pages:
  /          Home: what it does, download the extension
  /try       Try it in the browser: paste a message, get replies
  /guide     How to install and use the extension
  /privacy   What the extension reads and sends

API (used by the extension and the /try page; rate limited per visitor):
  POST /api/reply  {message, tone, goal, note, length} -> {replies: [..3], language}
"""
import os
import time
from collections import defaultdict, deque
from typing import Literal

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import gemini

load_dotenv()
PORT = int(os.getenv("PORT", "8005"))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")

app = FastAPI(title="AI Reply Helper")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["POST"], allow_headers=["Content-Type"])
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# ---------------- rate limit (keeps the free AI quota safe) ----------------

MAX_PER_HOUR = 40
_hits: dict = defaultdict(deque)


def check_rate_limit(request: Request) -> None:
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "?").split(",")[0].strip()
    hits, now = _hits[ip], time.time()
    while hits and now - hits[0] > 3600:
        hits.popleft()
    if len(hits) >= MAX_PER_HOUR:
        raise HTTPException(429, "You've reached the hourly limit of this free tool. Please try again later.")
    hits.append(now)


# ---------------- replies ----------------

TONES = {
    "professional": "professional and polite, suitable for work",
    "friendly": "warm, friendly and relaxed",
    "short": "very short and direct (one or two sentences)",
    "formal": "formal and respectful, like an official letter",
    "enthusiastic": "positive and enthusiastic",
}
GOALS = {
    "auto": "whatever reply makes the most sense",
    "yes": "say yes / agree / accept",
    "no": "politely say no / decline, keeping a good relationship",
    "info": "ask for the details or information that's missing",
    "thanks": "thank them",
    "later": "say you'll get back to them soon",
}
LENGTHS = {"short": "under 40 words", "medium": "40-90 words", "long": "90-160 words"}

PROMPT = """You help someone reply to a message they received (an email, chat, comment or review).

Write 3 different replies they could send. Each reply:
- Tone: {tone}.
- Goal: {goal}.
- Length: {length} (unless the tone says very short).
- Is written in the SAME language as the message.
- Answers what the message actually says. Never invent facts, dates, prices or promises
  that aren't in the message or the user's note; use a placeholder like [date] instead.
- Is ready to send: no subject line, no explanations, no quotes around it.
- Uses a greeting and sign-off only if they fit the message type (e.g. emails, not chat).
The 3 replies should differ in wording and approach, not just one word.
{note}
Reply with ONLY JSON: {{"language": "the message language's name in English, e.g. English, French, Urdu", "replies": ["reply 1", "reply 2", "reply 3"]}}"""


class ReplyRequest(BaseModel):
    message: str = Field(min_length=2, max_length=6000)
    tone: Literal["professional", "friendly", "short", "formal", "enthusiastic"] = "professional"
    goal: Literal["auto", "yes", "no", "info", "thanks", "later"] = "auto"
    length: Literal["short", "medium", "long"] = "medium"
    note: str = Field(default="", max_length=500)


@app.post("/api/reply")
def api_reply(body: ReplyRequest, request: Request):
    check_rate_limit(request)
    note = body.note.strip()
    system = PROMPT.format(
        tone=TONES[body.tone], goal=GOALS[body.goal], length=LENGTHS[body.length],
        note=f"\nWhat the user wants to say (use this, it's true): {note}" if note else "",
    )
    try:
        data = gemini.chat_json([
            {"role": "system", "content": system},
            {"role": "user", "content": "The message I received:\n\n" + body.message.strip()},
        ])
    except gemini.AIError as e:
        raise HTTPException(502, str(e))
    replies = [r.strip() for r in data.get("replies") or [] if isinstance(r, str) and r.strip()][:3]
    if not replies:
        raise HTTPException(502, "The AI didn't return any replies. Please try again.")
    return {"replies": replies, "language": str(data.get("language") or "")}


# ---------------- pages ----------------

def page(name: str):
    return FileResponse(os.path.join(STATIC_DIR, name))


@app.get("/")
def home():
    return page("home.html")


@app.get("/try")
def try_page():
    return page("try.html")


@app.get("/guide")
def guide():
    return page("guide.html")


@app.get("/privacy")
def privacy():
    return page("privacy.html")


app.mount("/extension", StaticFiles(directory=os.path.join(BASE_DIR, "extension")), name="extension")

if __name__ == "__main__":
    print(f"Open http://127.0.0.1:{PORT}")
    uvicorn.run(app, host="127.0.0.1", port=PORT)
