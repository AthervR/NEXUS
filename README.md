# NEXUS - Local AI Lab & Life Assistant
NEXUS is a self built edge computing system designed to run AI workloads locally on low power hardware for real time perception and decision making. I developed it as a hands on exploration of deploying computer vision and sensor fusion models on hardware instead of relying on cloud infrastructure that is controlled by large companies who don't care for your data security.

Features:
Local AI that runs on edge hardware (no cloud dependency - homelab friendly).

Real time processing of camera and sensor streams for on device decision making.

Modular pipeline for plugging in different sensor or control models.

Deployment on a consumer grade computer, including OS setup, drivers and runtime config.

System Architecture
Hardware: 
Self assembled edge compute node with integrated sensors and networking, built from off the shelf components that anyone can buy (later upgraded to mini pc - bought from Amazon).

Additional microphones, cameras, sensors, etc added to enhance actions and functions of the tiered model architecture.

Software stack:
Linux based host OS (Ubuntu) and containerized services for isolation and reliability.

Inference runtime for running optimized ML models (can be modified to personal choice) on CPU/GPU/accelerator as available.

Monitoring and logging layer to track system health and model performance on the device.

A simple pipeline ingests sensor data, performs pre processing, runs model inference and exposes results to downstream consumers (like control logic or visualization tools).

What I Built + Notes:
Designed the overall edge deployment architecture and selected the hardware components for the self-assembled node.

Provisioned and configured the OS, drivers, and runtime environment for reliable 24/7 edge operation.

Implemented the data ingestion and inference pipeline, with a focus on low latency and robustness to noisy sensor input.

Tested the system with real workloads and iterated on configuration to keep inference local, fast, and resilient to network issues.
