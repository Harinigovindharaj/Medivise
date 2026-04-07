const express = require("express");

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