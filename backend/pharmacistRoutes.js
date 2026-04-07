// pharmacistRoutes.js — MediVise Pharmacist API
const express = require("express");
const router = express.Router();
const axios = require("axios");

function isPharmacist(req, res, next) {
  if (!req.session.userId || req.session.role !== "pharmacist") {
    return res.status(403).json({ error: "Access denied" });
  }
  next();
}

// Helper: generate all drug pairs
function generatePairs(drugs) {
  const pairs = [];
  for (let i = 0; i < drugs.length; i++)
    for (let j = i + 1; j < drugs.length; j++)
      pairs.push([drugs[i], drugs[j]]);
  return pairs;
}

module.exports = (Prescription) => {

  /* 
   * GET /pharmacist/queue
   * Returns all prescriptions pending review
   * ───────────────────────────────────────── */
  router.get("/queue", isPharmacist, async (req, res) => {
    try {
      const prescriptions = await Prescription.find({
        $or: [{ status: null }, { status: "Pending" }]
      }).sort({ createdAt: -1 });

      res.json(prescriptions.map(p => ({
        id: p._id,
        drugs: p.drugs || [],
        status: p.status || "Pending",
        createdAt: p.createdAt,
        imageUrl: `http://localhost:5000/${p.image}`
      })));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch queue" });
    }
  });

  /* ─────────────────────────────────────────
   * GET /pharmacist/alerts
   * Returns high-risk prescriptions (flagged by ML)
   * ───────────────────────────────────────── */
  router.get("/alerts", isPharmacist, async (req, res) => {
    try {
      const prescriptions = await Prescription.find({
        "analysis.overallRisk": "High",
        $or: [{ status: null }, { status: "Pending" }]
      });

      res.json(prescriptions.map(p => ({
        id: p._id,
        drugs: p.drugs || [],
        overallRisk: p.analysis?.overallRisk,
        interactions: p.analysis?.interactions || [],
        createdAt: p.createdAt
      })));
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch alerts" });
    }
  });

  /* ─────────────────────────────────────────
   * GET /pharmacist/prescription/:id
   * Full detail for one prescription + ML analysis
   * ───────────────────────────────────────── */
  router.get("/prescription/:id", isPharmacist, async (req, res) => {
    try {
      const p = await Prescription.findById(req.params.id);
      if (!p) return res.status(404).json({ error: "Not found" });

      res.json({
        id: p._id,
        drugs: p.drugs || [],
        status: p.status || "Pending",
        note: p.note || "",
        analysis: p.analysis || null,
        imageUrl: `http://localhost:5000/${p.image}`,
        createdAt: p.createdAt
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch prescription" });
    }
  });

  /* ─────────────────────────────────────────
   * POST /pharmacist/analyze/:id
   * Run ML risk analysis on a prescription
   * ───────────────────────────────────────── */
  router.post("/analyze/:id", isPharmacist, async (req, res) => {
    try {
      const p = await Prescription.findById(req.params.id);
      if (!p) return res.status(404).json({ error: "Prescription not found" });

      const drugs = p.drugs || [];
      if (drugs.length < 2)
        return res.json({ message: "Not enough drugs for analysis", drugs });

      const pairs = generatePairs(drugs);

      const promises = pairs.map(([drug1, drug2]) =>
        axios.post("http://127.0.0.1:8000/analyze", {
          drug1: drug1.toLowerCase(),
          drug2: drug2.toLowerCase(),
          drug1_class: req.body.drug1_class || "NSAID",
          drug2_class: req.body.drug2_class || "NSAID",
          age: req.body.age || 40,
          condition: req.body.condition || "general",
          dosage1: req.body.dosage1 || 500,
          dosage2: req.body.dosage2 || 200
        })
        .then(r => ({ drug1, drug2, analysis: r.data }))
        .catch(() => ({ drug1, drug2, error: "ML service unavailable" }))
      );

      const results = await Promise.all(promises);

      let overallRisk = "Low";
      if (results.some(r => r.analysis?.severity === "high")) overallRisk = "High";
      else if (results.some(r => r.analysis?.severity === "moderate")) overallRisk = "Moderate";

      p.analysis = { interactions: results, overallRisk, createdAt: new Date() };
      await p.save();

      res.json({ drugs, interactions: results, overallRisk });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Analysis failed" });
    }
  });

  /* ─────────────────────────────────────────
   * POST /pharmacist/decision/:id
   * Approve, flag, or discard a prescription
   * Body: { action: "approve"|"flag"|"discard", note: "..." }
   * ───────────────────────────────────────── */
  router.post("/decision/:id", isPharmacist, async (req, res) => {
    try {
      const { action, note } = req.body;

      if (!["approve", "flag", "discard"].includes(action))
        return res.status(400).json({ error: "Invalid action" });

      const statusMap = { approve: "Approved", flag: "Flagged", discard: "Discarded" };

      const p = await Prescription.findByIdAndUpdate(
        req.params.id,
        {
          status: statusMap[action],
          note: note || "",
          decidedAt: new Date(),
          decidedBy: req.session.userId
        },
        { new: true }
      );

      if (!p) return res.status(404).json({ error: "Prescription not found" });

      res.json({
        success: true,
        id: p._id,
        status: p.status,
        message: `Prescription ${statusMap[action].toLowerCase()} successfully`
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Decision failed" });
    }
  });

  /* ─────────────────────────────────────────
   * GET /pharmacist/stats
   * Dashboard summary numbers
   * ───────────────────────────────────────── */
  router.get("/stats", isPharmacist, async (req, res) => {
    try {
      const [pending, alerts, approvedToday] = await Promise.all([
        Prescription.countDocuments({ $or: [{ status: null }, { status: "Pending" }] }),
        Prescription.countDocuments({
          "analysis.overallRisk": "High",
          $or: [{ status: null }, { status: "Pending" }]
        }),
        Prescription.countDocuments({
          status: "Approved",
          decidedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
        })
      ]);

      res.json({ pending, alerts, approvedToday });
    } catch (err) {
      res.status(500).json({ error: "Stats unavailable" });
    }
  });

  return router;
};
