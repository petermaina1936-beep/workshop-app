import { useEffect, useState } from "react";
import { db } from "./firebaseConfig";
import { collection, getDocs } from "firebase/firestore";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const COLORS = ["#4F46E5", "#22C55E", "#F59E0B", "#EF4444", "#3B82F6"];

export default function Dashboard() {
  const [jobs, setJobs] = useState([]);

  useEffect(() => {
    const loadJobs = async () => {
      const snap = await getDocs(collection(db, "jobs"));
      const data = snap.docs.map((doc) => doc.data());
      setJobs(data);
    };
    loadJobs();
  }, []);

  const countBy = (key) => {
    const counts = {};
    jobs.forEach((j) => {
      const value = j[key] || "Unknown";
      counts[value] = (counts[value] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  };

  const jobTypeData = countBy("jobType");
  const materialData = countBy("materials");
  const workerData = countBy("worker");

  return (
    <div className="p-4 font-sans">
      <h2 className="text-xl font-bold mb-4">Workshop Analytics</h2>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="border rounded p-3 shadow">
          <h3 className="font-semibold mb-2">Jobs by Type</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={jobTypeData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#3B82F6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="border rounded p-3 shadow">
          <h3 className="font-semibold mb-2">Jobs by Worker</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={workerData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#22C55E" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="border rounded p-3 shadow md:col-span-2">
          <h3 className="font-semibold mb-2">Most Used Materials</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={materialData}
                dataKey="value"
                nameKey="name"
                outerRadius={100}
                fill="#8884d8"
                label
              >
                {materialData.map((entry, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
