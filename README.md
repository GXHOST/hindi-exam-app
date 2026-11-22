# हिंदी परीक्षा तैयारी (Hindi Exam Prep)

MCQ exam app for Hindi (UP PGT 2026 paper, topic-wise practice, results, prep notes) with username/password accounts.

- `server.js` – zero-dependency Node server; stores users/results in `$DATA_DIR/exam-db.json`
- `index.html`, `css/`, `js/` – frontend
- `data/q_part1.txt` – question bank source (`no|question|A|B|C|D|answer|topic`)

Run locally: `node server.js` with `index.html`, `css`, `js` copied into `public/` — or `docker build -t hindi-exam . && docker run -p 1880:1880 hindi-exam`.
