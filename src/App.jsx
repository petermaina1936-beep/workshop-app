// src/App.jsx
import React, { useState, useEffect, useRef } from "react";
import logo from "./kadolta-logo.png";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

/*
  Full Workshop Job Card app:
  - KPL-### job numbers (assigned by the server, unique across all devices)
  - Save/Edit/Delete/View/Print/Export PDF
  - Technician & Inspector signatures (drawn on canvas, saved per-job)
  - shared online storage via /api/jobs (every device sees every job)
  - Search/filter list
*/

const initialJob = {
  jobNumber: "",
  customerName: "",
  dateOfRepair: "",
  machineModel: "",
  serialNumber: "",
  typeOfWork: [], // array of selected types
  problemReported: "",
  diagnosis: "",
  jobDetails: "",
  sparesUsed: "",
  comments: "",
  customerComments: "",
  technicians: "",
  inspector: "",
  startTime: "",
  finishTime: "",
  techSignature: "", // base64 image stored
  inspSignature: "", // base64 image stored
};

export default function App() {
  // state
  const [job, setJob] = useState({ ...initialJob });
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [showOnlyWithSignatures, setShowOnlyWithSignatures] = useState(false);

  // refs for signature canvases
  const techCanvasRef = useRef(null);
  const inspCanvasRef = useRef(null);
  const techDrawing = useRef(false);
  const inspDrawing = useRef(false);

  // refs for job DOM elements (for html2canvas)
  const jobRefs = useRef({});

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");

  // fetch all jobs (from every device) from the shared server
  const loadJobs = async () => {
    try {
      const res = await fetch("/api/jobs");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setJobs(await res.json());
      setLoadError("");
    } catch (e) {
      console.error("Cannot load jobs", e);
      setLoadError("Could not load jobs from the server. Check your internet connection.");
    } finally {
      setLoading(false);
    }
  };

  // on start: upload any jobs left in this device's old local storage, then load the shared list
  useEffect(() => {
    const init = async () => {
      const raw = localStorage.getItem("jobs");
      if (raw) {
        try {
          const localJobs = JSON.parse(raw);
          if (Array.isArray(localJobs) && localJobs.length) {
            const res = await fetch("/api/jobs", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ import: localJobs }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
          }
          localStorage.removeItem("jobs");
          localStorage.removeItem("jobCounter");
        } catch (e) {
          console.error("Cannot upload local jobs, will retry next time", e);
        }
      }
      await loadJobs();
    };
    init();

    // keep the list fresh so jobs recorded on other devices show up
    const timer = setInterval(loadJobs, 15000);
    const onFocus = () => loadJobs();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // helper: update form fields
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === "typeOfWork") {
      // toggle selection in array
      let arr = job.typeOfWork || [];
      if (checked) arr = [...arr, value];
      else arr = arr.filter((t) => t !== value);
      setJob((p) => ({ ...p, typeOfWork: arr }));
    } else {
      setJob((p) => ({ ...p, [name]: value }));
    }
  };

  // signature helpers (draw on canvas)
  const clearCanvas = (canvasRef) => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
  };

  // attach pointer events to canvas (startDrawing called on pointerdown)
  const startDrawing = (canvasRef, drawingRef, e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    drawingRef.current = true;

    const rect = canvas.getBoundingClientRect();
    const getXY = (ev) => {
      if (ev.touches && ev.touches.length) {
        return { x: ev.touches[0].clientX - rect.left, y: ev.touches[0].clientY - rect.top };
      }
      return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    };

    const start = getXY(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);

    const moveHandler = (ev) => {
      if (!drawingRef.current) return;
      const pt = getXY(ev);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y);
    };
    const upHandler = () => {
      drawingRef.current = false;
      ctx.beginPath();
      canvas.removeEventListener("pointermove", moveHandler);
      canvas.removeEventListener("pointerup", upHandler);
      canvas.removeEventListener("pointerleave", upHandler);
    };

    canvas.addEventListener("pointermove", moveHandler);
    canvas.addEventListener("pointerup", upHandler);
    canvas.addEventListener("pointerleave", upHandler);
  };

  // save job (create or update)
  const handleSave = async () => {
    if (saving) return;
    // minimal required fields
    if (!job.customerName || !job.dateOfRepair) {
      alert("Please enter Customer Name and Date of Repair.");
      return;
    }

    // capture signatures as base64
    const techSig = techCanvasRef.current?.toDataURL() || "";
    const inspSig = inspCanvasRef.current?.toDataURL() || "";

    setSaving(true);
    try {
      if (selectedJobId) {
        // update existing
        const res = await fetch(`/api/jobs?id=${selectedJobId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...job, techSignature: techSig, inspSignature: inspSig }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const updated = await res.json();
        setJobs((p) => p.map((j) => (j.id === updated.id ? updated : j)));
        alert("✅ Job updated");
      } else {
        // new job: the server assigns the next job number so no two devices get the same one
        const res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...job,
            techSignature: techSig,
            inspSignature: inspSig,
            dateSaved: new Date().toLocaleString(),
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const newJob = await res.json();
        setJobs((p) => [...p, newJob]);
        alert(`✅ Job saved as ${newJob.jobNumber}`);
      }
    } catch (e) {
      console.error("Save failed", e);
      alert("❌ Could not save the job. Check your internet connection and try again.");
      setSaving(false);
      return; // keep the form so nothing is lost
    }
    setSaving(false);

    // clear form and canvases
    setJob({ ...initialJob });
    clearCanvas(techCanvasRef);
    clearCanvas(inspCanvasRef);
    setSelectedJobId(null);
  };

  // edit job: load job into form and draw signatures to canvases
  const handleEdit = (j) => {
    setJob({
      customerName: j.customerName || "",
      dateOfRepair: j.dateOfRepair || "",
      machineModel: j.machineModel || "",
      serialNumber: j.serialNumber || "",
      typeOfWork: j.typeOfWork || [],
      problemReported: j.problemReported || "",
      diagnosis: j.diagnosis || "",
      jobDetails: j.jobDetails || "",
      sparesUsed: j.sparesUsed || "",
      comments: j.comments || "",
      customerComments: j.customerComments || "",
      technicians: j.technicians || "",
      inspector: j.inspector || "",
      startTime: j.startTime || "",
      finishTime: j.finishTime || "",
      techSignature: j.techSignature || "",
      inspSignature: j.inspSignature || "",
    });
    setSelectedJobId(j.id);

    // load signatures into canvases
    setTimeout(() => {
      if (j.techSignature && techCanvasRef.current) {
        const ctx = techCanvasRef.current.getContext("2d");
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, techCanvasRef.current.width, techCanvasRef.current.height);
          ctx.drawImage(img, 0, 0, techCanvasRef.current.width, techCanvasRef.current.height);
        };
        img.src = j.techSignature;
      } else clearCanvas(techCanvasRef);

      if (j.inspSignature && inspCanvasRef.current) {
        const ctx2 = inspCanvasRef.current.getContext("2d");
        const img2 = new Image();
        img2.onload = () => {
          ctx2.clearRect(0, 0, inspCanvasRef.current.width, inspCanvasRef.current.height);
          ctx2.drawImage(img2, 0, 0, inspCanvasRef.current.width, inspCanvasRef.current.height);
        };
        img2.src = j.inspSignature;
      } else clearCanvas(inspCanvasRef);
    }, 50);
  };

  // delete
  const handleDelete = async (id) => {
    if (!confirm("Delete this job card? It will be removed for all devices.")) return;
    try {
      const res = await fetch(`/api/jobs?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setJobs((p) => p.filter((j) => j.id !== id));
    } catch (e) {
      console.error("Delete failed", e);
      alert("❌ Could not delete the job. Check your internet connection.");
    }
    // numbers are never reused - the server sequence only moves forward
  };

  // print: open a new window with formatted HTML and call print
  const printJob = (jobData) => {
    const w = window.open("", "_blank");
    const html = `
      <html>
        <head>
          <title>${jobData.jobNumber}</title>
          <style>
            body{font-family: Arial, sans-serif; padding:20px; color:#111}
            header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
            .logo{height:70px}
            .job-number{font-size:18px;font-weight:700;color:#0b5ea6}
            .section{margin-top:10px}
            .sig{width:300px;height:80px;border:1px solid #333;display:block;margin-top:6px}
            table{border-collapse:collapse;width:100%}
            td{vertical-align:top;padding:6px;border:1px solid #ddd}
          </style>
        </head>
        <body>
          <header>
            <div style="display:flex;align-items:center;gap:12px">
              <img src="${logo}" class="logo" />
              <div>
                <div style="font-weight:800">Kadolta Packaging Ltd</div>
                <div style="font-size:12px;color:#555">Professional Workshop & Technical Services</div>
                <div style="font-size:12px;color:#555">Tel: 0722 123 456 | info@kadolta.co.ke</div>
              </div>
            </div>
            <div class="job-number">${jobData.jobNumber}</div>
          </header>

          <h3>Job Details</h3>
          <table>
            <tr>
              <td><strong>Customer</strong><br/>${jobData.customerName || "-"}</td>
              <td><strong>Date</strong><br/>${jobData.dateOfRepair || "-"}</td>
            </tr>
            <tr>
              <td><strong>Machine Model</strong><br/>${jobData.machineModel || "-"}</td>
              <td><strong>Serial #</strong><br/>${jobData.serialNumber || "-"}</td>
            </tr>
            <tr>
              <td colspan="2"><strong>Type of Work</strong><br/>${(jobData.typeOfWork||[]).join(", ") || "-"}</td>
            </tr>
            <tr>
              <td colspan="2"><strong>Problem Reported</strong><br/>${jobData.problemReported || "-"}</td>
            </tr>
            <tr>
              <td colspan="2"><strong>Diagnosis</strong><br/>${jobData.diagnosis || "-"}</td>
            </tr>
            <tr>
              <td colspan="2"><strong>Details of Job Done</strong><br/>${jobData.jobDetails || "-"}</td>
            </tr>
            <tr>
              <td colspan="2"><strong>Spares Used</strong><br/>${jobData.sparesUsed || "-"}</td>
            </tr>
            <tr>
              <td colspan="2"><strong>Recommendations / Comments</strong><br/>${jobData.comments || "-"}</td>
            </tr>
            <tr>
              <td><strong>Technicians</strong><br/>${jobData.technicians || "-"}</td>
              <td><strong>Inspector</strong><br/>${jobData.inspector || "-"}</td>
            </tr>
          </table>

          <div class="section">
            <div><strong>Technician Signature</strong></div>
            ${jobData.techSignature ? `<img src="${jobData.techSignature}" class="sig"/>` : `<div class="sig"></div>`}
          </div>

          <div class="section">
            <div><strong>Inspector Signature</strong></div>
            ${jobData.inspSignature ? `<img src="${jobData.inspSignature}" class="sig"/>` : `<div class="sig"></div>`}
          </div>

          <div style="margin-top:18px;font-size:12px;color:#666">Saved: ${jobData.dateSaved || "-"}</div>
        </body>
      </html>
    `;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
    }, 500);
  };

  // Export to PDF using html2canvas to capture the job DOM (best layout fidelity)
  const exportJobToPDF = async (jobData) => {
    try {
      // build a hidden element from jobData to ensure clean layout for PDF
      const wrapper = document.createElement("div");
      wrapper.style.width = "794px"; // ~A4 px width at 96dpi
      wrapper.style.padding = "24px";
      wrapper.style.background = "#fff";
      wrapper.style.fontFamily = "Arial, sans-serif";
      wrapper.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="display:flex;align-items:center;gap:12px">
            <img src="${logo}" style="width:90px;height:auto" />
            <div>
              <div style="font-weight:800;font-size:18px;color:#0b5ea6">Kadolta Packaging Ltd</div>
              <div style="font-size:12px;color:#333">Professional Workshop & Technical Services</div>
              <div style="font-size:12px;color:#333">Tel: 0722 123 456 | info@kadolta.co.ke</div>
            </div>
          </div>
          <div style="text-align:right">
            <div style="font-size:16px;font-weight:700;color:#0b5ea6">${jobData.jobNumber}</div>
            <div style="font-size:12px;color:#555">${jobData.dateSaved || ""}</div>
          </div>
        </div>
        <hr style="margin:12px 0 18px 0;border:none;border-top:1px solid #eee" />

        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <tr>
            <td style="padding:8px;border:1px solid #eee"><strong>Customer</strong><br/>${jobData.customerName || "-"}</td>
            <td style="padding:8px;border:1px solid #eee"><strong>Date</strong><br/>${jobData.dateOfRepair || "-"}</td>
          </tr>
          <tr>
            <td style="padding:8px;border:1px solid #eee"><strong>Machine</strong><br/>${jobData.machineModel || "-"}</td>
            <td style="padding:8px;border:1px solid #eee"><strong>Serial #</strong><br/>${jobData.serialNumber || "-"}</td>
          </tr>
          <tr>
            <td colspan="2" style="padding:8px;border:1px solid #eee"><strong>Type of Work</strong><br/>${(jobData.typeOfWork||[]).join(", ") || "-"}</td>
          </tr>
          <tr>
            <td colspan="2" style="padding:8px;border:1px solid #eee"><strong>Problem Reported</strong><br/>${jobData.problemReported || "-"}</td>
          </tr>
          <tr>
            <td colspan="2" style="padding:8px;border:1px solid #eee"><strong>Diagnosis</strong><br/>${jobData.diagnosis || "-"}</td>
          </tr>
          <tr>
            <td colspan="2" style="padding:8px;border:1px solid #eee"><strong>Job Done</strong><br/>${jobData.jobDetails || "-"}</td>
          </tr>
          <tr>
            <td colspan="2" style="padding:8px;border:1px solid #eee"><strong>Spares Used</strong><br/>${jobData.sparesUsed || "-"}</td>
          </tr>
        </table>

        <div style="display:flex;gap:24px;margin-top:14px;">
          <div style="flex:1">
            <div style="font-weight:700;margin-bottom:6px">Technician</div>
            <div>${jobData.technicians || "-"}</div>
            <div style="margin-top:8px">${jobData.techSignature ? `<img src="${jobData.techSignature}" style="width:260px;height:auto;border:1px solid #ccc" />` : '<div style="width:260px;height:80px;border:1px solid #ccc"></div>'}</div>
          </div>
          <div style="flex:1">
            <div style="font-weight:700;margin-bottom:6px">Inspector</div>
            <div>${jobData.inspector || "-"}</div>
            <div style="margin-top:8px">${jobData.inspSignature ? `<img src="${jobData.inspSignature}" style="width:260px;height:auto;border:1px solid #ccc" />` : '<div style="width:260px;height:80px;border:1px solid #ccc"></div>'}</div>
          </div>
        </div>

        <div style="margin-top:14px;font-size:11px;color:#666">Saved: ${jobData.dateSaved || "-"}</div>
      `;

      // put off-screen, capture, then remove
      wrapper.style.position = "fixed";
      wrapper.style.left = "-2000px";
      document.body.appendChild(wrapper);

      const canvas = await html2canvas(wrapper, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      document.body.removeChild(wrapper);

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pageWidth - 20; // margins
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

      pdf.addImage(imgData, "PNG", 10, 10, pdfWidth, pdfHeight);
      pdf.save(`${jobData.jobNumber || "job"}.pdf`);
    } catch (err) {
      console.error("PDF export failed", err);
      alert("PDF export failed. See console for details.");
    }
  };

  // search & filter the jobs list
  const filteredJobs = jobs.filter((j) => {
    if (showOnlyWithSignatures) {
      if (!j.techSignature || !j.inspSignature) return false;
    }
    if (filterType) {
      if (!j.typeOfWork || !j.typeOfWork.includes(filterType)) return false;
    }
    const q = search.trim().toLowerCase();
    if (!q) return true;
    // search by customer, jobNumber, machineModel
    return (
      (j.customerName || "").toLowerCase().includes(q) ||
      (j.jobNumber || "").toLowerCase().includes(q) ||
      (j.machineModel || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-slate-50 p-4 flex flex-col items-center">
      <div className="w-full max-w-6xl">
        {/* header */}
        <div className="bg-white rounded-xl shadow p-4 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src={logo} alt="Kadolta" className="w-20" />
            <div>
              <div className="text-xl font-bold text-sky-800">Kadolta Packaging Ltd</div>
              <div className="text-sm text-gray-600">Professional Workshop & Technical Services</div>
              <div className="text-sm text-gray-600">Tel: 0722 123 456 • info@kadolta.co.ke</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-500">Job Card System</div>
            <div className="text-lg font-semibold text-sky-700">{/* next preview */}</div>
          </div>
        </div>

        {/* form area */}
        <div className="bg-white rounded-xl shadow p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Create / Edit Job Card</h2>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  // quick export last saved
                  if (!jobs.length) return alert("No saved jobs.");
                  exportJobToPDF(jobs[jobs.length - 1]);
                }}
                className="bg-green-600 text-white px-3 py-1 rounded text-sm"
              >
                Export Last
              </button>
              <button
                onClick={async () => {
                  if (!confirm("Clear ALL saved jobs for every device? This cannot be undone.")) return;
                  try {
                    const res = await fetch("/api/jobs?all=true", { method: "DELETE" });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    setJobs([]);
                  } catch (e) {
                    console.error("Clear failed", e);
                    alert("❌ Could not clear jobs. Check your internet connection.");
                  }
                }}
                className="bg-red-500 text-white px-3 py-1 rounded text-sm"
              >
                Clear All
              </button>
            </div>
          </div>

          {/* grid form */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input name="customerName" value={job.customerName} onChange={handleChange} placeholder="Customer Name *" className="border p-2 rounded" />
            <input type="date" name="dateOfRepair" value={job.dateOfRepair} onChange={handleChange} className="border p-2 rounded" />
            <input name="machineModel" value={job.machineModel} onChange={handleChange} placeholder="Machine Model" className="border p-2 rounded" />
            <input name="serialNumber" value={job.serialNumber} onChange={handleChange} placeholder="Serial Number" className="border p-2 rounded" />

            <div className="col-span-1 md:col-span-2">
              <div className="mb-2 font-semibold">Type of Work</div>
              <div className="flex gap-4">
                {["Installation", "Repair", "Service", "Demo"].map((t) => (
                  <label key={t} className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="typeOfWork"
                      value={t}
                      checked={(job.typeOfWork || []).includes(t)}
                      onChange={handleChange}
                    />
                    <span>{t}</span>
                  </label>
                ))}
              </div>
            </div>

            <textarea name="problemReported" value={job.problemReported} onChange={handleChange} placeholder="Problem Reported *" className="border p-2 rounded col-span-1 md:col-span-2" />
            <textarea name="diagnosis" value={job.diagnosis} onChange={handleChange} placeholder="Diagnosis" className="border p-2 rounded col-span-1 md:col-span-2" />
            <textarea name="jobDetails" value={job.jobDetails} onChange={handleChange} placeholder="Details of Job Done" className="border p-2 rounded col-span-1 md:col-span-2" />
            <textarea name="sparesUsed" value={job.sparesUsed} onChange={handleChange} placeholder="Spares Used" className="border p-2 rounded col-span-1 md:col-span-2" />
            <textarea name="comments" value={job.comments} onChange={handleChange} placeholder="Comments & Recommendations" className="border p-2 rounded col-span-1 md:col-span-2" />
            <textarea name="customerComments" value={job.customerComments} onChange={handleChange} placeholder="Customer Comments" className="border p-2 rounded col-span-1 md:col-span-2" />
            <input name="technicians" value={job.technicians} onChange={handleChange} placeholder="Technician(s) Name(s)" className="border p-2 rounded" />
            <input name="inspector" value={job.inspector} onChange={handleChange} placeholder="Inspector Name" className="border p-2 rounded" />
            <input name="startTime" value={job.startTime} onChange={handleChange} placeholder="Start Time" className="border p-2 rounded" />
            <input name="finishTime" value={job.finishTime} onChange={handleChange} placeholder="Finish Time" className="border p-2 rounded" />
          </div>

          {/* signatures */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
            <div>
              <div className="font-semibold mb-2">Technician Signature</div>
              <canvas ref={techCanvasRef} width={600} height={160} className="border rounded bg-white" onPointerDown={(e) => startDrawing(techCanvasRef, techDrawing, e)} />
              <div className="flex gap-2 mt-2">
                <button onClick={() => clearCanvas(techCanvasRef)} className="text-sm px-3 py-1 bg-gray-200 rounded">Clear</button>
              </div>
            </div>
            <div>
              <div className="font-semibold mb-2">Inspector Signature</div>
              <canvas ref={inspCanvasRef} width={600} height={160} className="border rounded bg-white" onPointerDown={(e) => startDrawing(inspCanvasRef, inspDrawing, e)} />
              <div className="flex gap-2 mt-2">
                <button onClick={() => clearCanvas(inspCanvasRef)} className="text-sm px-3 py-1 bg-gray-200 rounded">Clear</button>
              </div>
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            <button onClick={handleSave} disabled={saving} className="bg-sky-700 text-white px-4 py-2 rounded disabled:opacity-60"> {saving ? "Saving..." : selectedJobId ? "Update Job" : "Save Job"} </button>
            <button onClick={() => { setJob({ ...initialJob }); clearCanvas(techCanvasRef); clearCanvas(inspCanvasRef); setSelectedJobId(null); }} className="bg-gray-300 px-3 py-2 rounded"> Clear </button>
          </div>
        </div>

        {/* search / filter */}
        <div className="bg-white rounded-xl shadow p-3 mb-4 flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="flex gap-2 items-center">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by customer, job no or model" className="border p-2 rounded w-64" />
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="border p-2 rounded">
              <option value="">All types</option>
              <option>Installation</option>
              <option>Repair</option>
              <option>Service</option>
              <option>Demo</option>
            </select>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showOnlyWithSignatures} onChange={(e) => setShowOnlyWithSignatures(e.target.checked)} />
              Only with signatures
            </label>
          </div>

          <div className="text-sm text-gray-600">Saved jobs: <strong>{jobs.length}</strong></div>
        </div>

        {/* jobs list */}
        <div className="bg-white rounded-xl shadow p-4">
          {loadError && <p className="text-red-600 mb-2">{loadError}</p>}
          {loading ? (
            <p className="text-gray-500">Loading job cards...</p>
          ) : filteredJobs.length === 0 ? (
            <p className="text-gray-500">No job cards found.</p>
          ) : (
            <ul className="space-y-3">
              {filteredJobs.map((j) => (
                <li key={j.id} className="border rounded p-3 flex flex-col md:flex-row md:justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-3">
                      <div className="text-sky-700 font-semibold">{j.jobNumber}</div>
                      <div className="font-medium">{j.customerName}</div>
                      <div className="text-xs text-gray-500">({j.dateOfRepair})</div>
                    </div>
                    <div className="text-sm text-gray-600">{j.machineModel} • {j.serialNumber}</div>
                    <div className="text-sm mt-2">{(j.typeOfWork||[]).join(", ")}</div>
                  </div>

                  <div className="flex gap-2 items-center">
                    <button onClick={() => { handleEdit(j); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="bg-yellow-300 px-3 py-1 rounded text-sm">Edit</button>
                    <button onClick={() => { printJob(j); }} className="bg-green-600 px-3 py-1 rounded text-white text-sm">Print</button>
                    <button onClick={() => exportJobToPDF(j)} className="bg-blue-600 px-3 py-1 rounded text-white text-sm">Export PDF</button>
                    <button onClick={() => handleDelete(j.id)} className="bg-red-500 px-3 py-1 rounded text-white text-sm">Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

      </div>
    </div>
  );
}
