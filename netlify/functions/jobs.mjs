// Shared job card storage so every device sees the same jobs and job numbers.
import { getDatabase } from "@netlify/database";

const db = getDatabase();

// fields managed by the server, never stored inside the JSON data blob
const stripMeta = ({ id, jobNumber, dateSaved, ...rest }) => rest;

const toJob = (row) => ({
  ...row.data,
  id: row.id,
  jobNumber: row.job_number,
  dateSaved: row.date_saved,
});

// next KPL-### number from a database sequence: atomic, never reused across devices
const nextJobNumber = async () => {
  const [{ n }] = await db.sql`SELECT nextval('job_number_seq') AS n`;
  return `KPL-${String(n).padStart(3, "0")}`;
};

const insertJob = async (job, jobNumber) => {
  const [row] = await db.sql`
    INSERT INTO jobs (job_number, data, date_saved)
    VALUES (${jobNumber}, ${JSON.stringify(stripMeta(job))}::jsonb, ${job.dateSaved || new Date().toLocaleString()})
    RETURNING *
  `;
  return toJob(row);
};

// import jobs saved earlier on a device's local storage, keeping their number when it's still free
const importJob = async (job) => {
  const wanted = /^KPL-\d+$/.test(job.jobNumber || "") ? job.jobNumber : null;
  if (wanted) {
    const [dup] = await db.sql`
      SELECT * FROM jobs WHERE job_number = ${wanted} AND data = ${JSON.stringify(stripMeta(job))}::jsonb
    `;
    if (dup) return toJob(dup); // already imported from this device
    const [taken] = await db.sql`SELECT 1 FROM jobs WHERE job_number = ${wanted}`;
    if (!taken) {
      try {
        const saved = await insertJob(job, wanted);
        // make sure the sequence never hands this number out again
        const num = parseInt(wanted.slice(4), 10);
        await db.sql`SELECT setval('job_number_seq', GREATEST(${num}, (SELECT last_value FROM job_number_seq)))`;
        return saved;
      } catch (e) {
        // another device grabbed the number at the same moment; fall through to a fresh one
      }
    }
  }
  return insertJob(job, await nextJobNumber());
};

export default async (req) => {
  const url = new URL(req.url);
  const id = parseInt(url.searchParams.get("id") || "", 10);

  try {
    if (req.method === "GET") {
      const rows = await db.sql`SELECT * FROM jobs ORDER BY id ASC`;
      return Response.json(rows.map(toJob));
    }

    if (req.method === "POST") {
      const body = await req.json();
      if (Array.isArray(body.import)) {
        const imported = [];
        for (const j of body.import) imported.push(await importJob(j));
        return Response.json(imported, { status: 201 });
      }
      const job = await insertJob(body, await nextJobNumber());
      return Response.json(job, { status: 201 });
    }

    if (req.method === "PUT") {
      if (!id) return new Response("Missing id", { status: 400 });
      const body = await req.json();
      const [row] = await db.sql`
        UPDATE jobs SET data = ${JSON.stringify(stripMeta(body))}::jsonb, updated_at = NOW()
        WHERE id = ${id} RETURNING *
      `;
      if (!row) return new Response("Not found", { status: 404 });
      return Response.json(toJob(row));
    }

    if (req.method === "DELETE") {
      if (url.searchParams.get("all") === "true") {
        await db.sql`DELETE FROM jobs`;
      } else {
        if (!id) return new Response("Missing id", { status: 400 });
        await db.sql`DELETE FROM jobs WHERE id = ${id}`;
      }
      return new Response(null, { status: 204 });
    }

    return new Response("Method not allowed", { status: 405 });
  } catch (err) {
    console.error("jobs api error", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
};

export const config = { path: "/api/jobs" };
