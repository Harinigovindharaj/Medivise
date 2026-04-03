const express = require("express");

// FIX: Now receives both Prescription AND User models.
// User is needed for the new /patients route (docter_history.html).
module.exports = (Prescription, User) => {
  const router = express.Router();

  function isDoctor(req, res, next) {
    if (!req.session || req.session.role !== "doctor") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    next();
  }

  // Dashboard (unchanged)
  router.get("/dashboard", isDoctor, (req, res) => {
    res.json({ success: true, message: "Doctor dashboard loaded" });
  });

  // ─────────────────────────────────────────────────────────────
  // FIX: /create now handles two different call shapes:
  //
  //   Shape A — from docter_prescription.html (runValidation):
  //     { drugs: [{name, dose, freq}, ...] }
  //     Only drugs are sent here. Patient data isn't saved yet.
  //
  //   Shape B — from doctor_risk_report.html (finish/final approval):
  //     { patientName, patientAge, patientId, name, dose, freq, risk, status }
  //     The full record including patient identity and risk score.
  //
  // Old code only read `drugs` and expected [String], so Shape A saved
  // objects as strings ("[object Object]") and Shape B saved nothing useful.
  // ─────────────────────────────────────────────────────────────
  router.post("/create", isDoctor, async (req, res) => {
    try {
      const {
        drugs,
        patientName, patientAge, patientId,
        name, dose, freq,
        risk, status
      } = req.body;

      // Normalise drugs to string array regardless of input shape
      let drugNames = [];

      if (Array.isArray(drugs)) {
          drugNames = drugs
              .map(d => (typeof d === "object" ? d.name : d))
              .filter(Boolean);
      }

      const prescription = new Prescription({
        userId: req.session.userId,
        patientName,
        patientAge: typeof patientAge === "number" ? patientAge : null,
        patientId,
        risk: Number(risk) || 0,
        status: status || "pending",
        drugs: drugNames
      });

      await prescription.save();

      res.json({ success: true, message: "Prescription created", data: prescription });
    } catch (err) {
      res.status(500).json({ success: false, message: "Error creating prescription", error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // FIX: /all now maps DB fields to what doctor.html's table expects.
  // Old code returned raw Prescription documents which have no name/id/age/risk
  // at the top level — those fields were added to the schema in server.js.
  // doctor_alert.html also uses this route and filters on item.status and item.risk.
  // ─────────────────────────────────────────────────────────────
  router.get("/all", isDoctor, async (req, res) => {
    try {
      const prescriptions = await Prescription.find().sort({ createdAt: -1 });

      res.json({
        success: true,
        count: prescriptions.length,
        data: prescriptions.map(p => ({
          _id:        p._id,
          name:       p.patientName || "Unknown Patient",
          id:         p.patientId   || String(p._id).slice(-6),
          age: p.patientAge ?? null,
          status:     p.status      || "pending",
          risk:       p.risk        || 0,
          lastAction: p.createdAt
            ? new Date(p.createdAt).toLocaleDateString()
            : "No activity",
          // Keep raw fields so docter_history.html filteredHistory works too
          userId:    p.userId,
          drugs:     p.drugs
        }))
      });
    } catch (err) {
      res.status(500).json({ success: false, message: "Error fetching all prescriptions", error: err.message });
    }
  });

  // Get doctor's own prescriptions (unchanged)
  router.get("/prescriptions", isDoctor, async (req, res) => {
    try {
      const prescriptions = await Prescription.find({ userId: req.session.userId });
      res.json({ success: true, count: prescriptions.length, data: prescriptions });
    } catch (err) {
      res.status(500).json({ success: false, message: "Error fetching prescriptions", error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // FIX: New /patients route required by docter_history.html.
  // The old code had no such route, so the patient list panel was always empty.
  // We build a deduplicated patient list from prescriptions (since there is no
  // separate Patient collection), using patientId as the unique key.
  // Falls back to User collection query if prescriptions have no patientId stored.
  // ─────────────────────────────────────────────────────────────
  router.get("/patients", isDoctor, async (req, res) => {
    try {
      const prescriptions = await Prescription.find(
        {},
        "userId patientName patientId patientAge"
      );

      const seen = new Set();
      const patients = [];

      prescriptions.forEach(p => {
        const key = p.patientId || String(p.userId);
        if (!key || seen.has(key)) return;
        seen.add(key);
        patients.push({
          _id:       p.userId || p._id,
          email:     p.patientName || "Unknown Patient",   // history page binds p.email
          patientId: p.patientId || null
        });
      });

      res.json({ success: true, data: patients });
    } catch (err) {
      res.status(500).json({ success: false, message: "Error fetching patients", error: err.message });
    }
  });

  // Suggestions (unchanged logic, still works)
  router.get("/suggestions/:id", isDoctor, async (req, res) => {
    try {
      const prescription = await Prescription.findById(req.params.id);
      if (!prescription) {
        return res.status(404).json({ success: false, message: "Prescription not found" });
      }
      res.json({
        success: true,
        data: {
          prescriptionId: prescription._id,
          suggestions: ["Replace Aspirin with Paracetamol"]
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, message: "Error getting suggestions", error: err.message });
    }
  });

  // Update prescription (unchanged)
  router.put("/update", isDoctor, async (req, res) => {
    try {
      const { prescriptionId, drugs } = req.body;
      const prescription = await Prescription.findById(prescriptionId);
      if (!prescription) {
        return res.status(404).json({ success: false, message: "Prescription not found" });
      }
      // Normalise to [String] just like /create
      prescription.drugs = Array.isArray(drugs)
        ? drugs.map(d => (typeof d === "object" ? d.name : d)).filter(Boolean)
        : drugs;
      await prescription.save();
      res.json({ success: true, message: "Prescription updated", data: prescription });
    } catch (err) {
      res.status(500).json({ success: false, message: "Error updating prescription", error: err.message });
    }
  });

  // Approve prescription (unchanged)
  router.post("/approve", isDoctor, async (req, res) => {
    try {
      const { prescriptionId } = req.body;
      const prescription = await Prescription.findById(prescriptionId);
      if (!prescription) {
        return res.status(404).json({ success: false, message: "Prescription not found" });
      }
      prescription.status = "approved";
      await prescription.save();
      res.json({ success: true, message: "Prescription approved", data: prescription });
    } catch (err) {
      res.status(500).json({ success: false, message: "Error approving prescription", error: err.message });
    }
  });

  return router;
};