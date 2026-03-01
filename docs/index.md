---
layout: home

hero:
    name: DAG
    text: Deploy Applications via GitOps
    tagline: Push Helm charts from CI pipelines to IAC repos and monitor Kubernetes deployments in real time.
    actions:
        - theme: brand
          text: Get Started
          link: /getting-started
        - theme: alt
          text: Architecture
          link: /architecture

features:
    - title: GitOps Native
      details: Automatically commits Helm charts to your Infrastructure-as-Code repository, keeping your Git repo as the single source of truth.
    - title: Real-Time Monitoring
      details: Streams deployment status via SSE — watch your release go from pending to deployed with live updates in your CI pipeline.
    - title: Flux & Plain Helm
      details: Supports both FluxCD HelmRelease CRDs and plain Helm release secrets for monitoring deployment progress.
    - title: CI Auto-Detection
      details: Automatically detects GitLab CI environments — repo URL, job ID, and tokens are picked up from environment variables. GitHub Actions detection is planned.
---
