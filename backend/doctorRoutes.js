const express = require("express");

module.exports = (Prescription) => {
  const router = express.Router();

  function isDoctor(req, res, next) {
    if (!req.session || req.session.role !== "doctor") {
      return res.status(403).json({
        success: false,
        message: "Access denied"
      });
    }
    next();
  }

  // Dashboard
  router.get("/dashboard", isDoctor, (req, res) => {
    res.json({
      success: true,
      message: "Doctor dashboard loaded"
    });
  });

  // Create prescription
  router.post("/create", isDoctor, async (req, res) => {
    try {
      const { drugs } = req.body;

      const prescription = new Prescription({
        userId: req.session.userId,
        drugs
      });

      await prescription.save();

      res.json({
        success: true,
        message: "Prescription created",
        data: prescription
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: "Error creating prescription",
        error: err.message
      });
    }
  });

  // Get doctor's prescriptions
  router.get("/prescriptions", isDoctor, async (req, res) => {
    try {
      const prescriptions = await Prescription.find({
        userId: req.session.userId
      });

      res.json({
        success: true,
        count: prescriptions.length,
        data: prescriptions
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: "Error fetching prescriptions",
        error: err.message
      });
    }
  });

  // Get all prescriptions
  router.get("/all", isDoctor, async (req, res) => {
    try {
      const prescriptions = await Prescription.find();

      res.json({
        success: true,
        count: prescriptions.length,
        data: prescriptions
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: "Error fetching all prescriptions",
        error: err.message
      });
    }
  });

  // Suggestions
  router.get("/suggestions/:id", isDoctor, async (req, res) => {
    try {
      const prescription = await Prescription.findById(req.params.id);

      if (!prescription) {
        return res.status(404).json({
          success: false,
          message: "Prescription not found"
        });
      }

      res.json({
        success: true,
        data: {
          prescriptionId: prescription._id,
          suggestions: ["Replace Aspirin with Paracetamol"]
        }
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: "Error getting suggestions",
        error: err.message
      });
    }
  });

  // Update prescription
  router.put("/update", isDoctor, async (req, res) => {
    try {
      const { prescriptionId, drugs } = req.body;

      const prescription = await Prescription.findById(prescriptionId);
      if (!prescription) {
        return res.status(404).json({
          success: false,
          message: "Prescription not found"
        });
      }

      prescription.drugs = drugs;
      await prescription.save();

      res.json({
        success: true,
        message: "Prescription updated",
        data: prescription
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: "Error updating prescription",
        error: err.message
      });
    }
  });

  // Approve prescription
  router.post("/approve", isDoctor, async (req, res) => {
    try {
      const { prescriptionId } = req.body;

      const prescription = await Prescription.findById(prescriptionId);
      if (!prescription) {
        return res.status(404).json({
          success: false,
          message: "Prescription not found"
        });
      }

      prescription.status = "approved";
      await prescription.save();

      res.json({
        success: true,
        message: "Prescription approved",
        data: prescription
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: "Error approving prescription",
        error: err.message
      });
    }
  });

  return router;
};