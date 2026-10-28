import type { Config, Context } from "@netlify/functions";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { jobs } from "../../db/schema.js";

// Fields the client is allowed to write
const FIELDS = [
  "customerName",
  "dateOfRepair",
  "machineModel",
  "serialNumber",
  "typeOfWork",
  "problemReported",
  "diagnosis",
  "jobDetails",
  "sparesUsed",
  "comments",
  "customerComments",
  "technicians",
  "inspector",
  "startTime",
  "finishTime",
  "techSignature",
  "inspSignature",
] as const;

type JobInput = Partial<Record<(typeof FIELDS)[number], unknown>>;

const pickFields = (body: JobInput) => {
  const out: Record<string, unknown> = {};
  for (const key of FIELDS) {
    if (body[key] === undefined) continue;
    if (key === "typeOfWork") {
      out[key] = Array.isArray(body[key]) ? (body[key] as unknown[]).map(String) : [];
    } else {
      out[key] = String(body[key] ?? "");
    }
  }
  return out;
};

// Shape returned to the client (keeps the original localStorage field names)
const toClient = (row: typeof jobs.$inferSelect) => ({
  ...row,
  dateSaved: row.createdAt.toLocaleString(),
});

// Next KPL-### number, based on the highest number already used
const nextJobNumber = sql<string>`'KPL-' || lpad((
  select coalesce(max(substring(${jobs.jobNumber} from '^KPL-([0-9]+)$')::int), 0) + 1 from ${jobs}
)::text, 3, '0')`;

const isUniqueViolation = (err: unknown) =>
  (err as { code?: string })?.code === "23505" ||
  (err as { cause?: { code?: string } })?.cause?.code === "23505";

export default async (req: Request, context: Context) => {
  const id = context.params.id ? Number(context.params.id) : null;
  if (context.params.id && !Number.isInteger(id)) {
    return Response.json({ error: "Invalid job id" }, { status: 400 });
  }

  try {
    if (req.method === "GET" && id === null) {
      const rows = await db.select().from(jobs).orderBy(asc(jobs.id));
      return Response.json(rows.map(toClient));
    }

    if (req.method === "POST" && id === null) {
      const body = (await req.json()) as JobInput & { jobNumber?: string; import?: boolean };
      const values = pickFields(body);
      if (!values.customerName || !values.dateOfRepair) {
        return Response.json({ error: "Customer Name and Date of Repair are required" }, { status: 400 });
      }

      // Importing an existing job keeps its number; skip it if it's already in the database
      if (body.import && typeof body.jobNumber === "string" && body.jobNumber) {
        const [row] = await db
          .insert(jobs)
          .values({ ...(values as typeof jobs.$inferInsert), jobNumber: body.jobNumber })
          .onConflictDoNothing({ target: jobs.jobNumber })
          .returning();
        return Response.json(row ? toClient(row) : null, { status: row ? 201 : 200 });
      }

      // Retry if two jobs are created at the same moment and race for a number
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const [row] = await db
            .insert(jobs)
            .values({ ...(values as typeof jobs.$inferInsert), jobNumber: nextJobNumber })
            .returning();
          return Response.json(toClient(row), { status: 201 });
        } catch (err) {
          if (!isUniqueViolation(err)) throw err;
        }
      }
      return Response.json({ error: "Could not allocate a job number, please retry" }, { status: 409 });
    }

    if (req.method === "PUT" && id !== null) {
      const values = pickFields((await req.json()) as JobInput);
      const [row] = await db
        .update(jobs)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(jobs.id, id))
        .returning();
      if (!row) return Response.json({ error: "Job not found" }, { status: 404 });
      return Response.json(toClient(row));
    }

    if (req.method === "DELETE") {
      if (id === null) await db.delete(jobs);
      else await db.delete(jobs).where(eq(jobs.id, id));
      return new Response(null, { status: 204 });
    }

    return new Response("Method not allowed", { status: 405 });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Database error" }, { status: 500 });
  }
};

export const config: Config = {
  path: ["/api/jobs", "/api/jobs/:id"],
};
