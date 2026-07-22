# DistroMap Server Setup Guide

## Overview

This document explains how to deploy DistroMap using two local Ubuntu servers.

The architecture splits responsibilities:

* **Server 1:** Main application server
* **Server 2:** Worker/data processing server

The goal is to create a scalable self-hosted Linux ecosystem knowledge graph platform.

---

# Hardware

## Server 1: Main Server

Recommended:

* 8GB RAM
* 64GB+ storage
* Intel i3 or better

Responsibilities:

* Website hosting
* API
* Database
* Reverse proxy
* Public access

---

## Server 2: Worker Server

Hardware:

* 8GB RAM
* 8GB storage

Responsibilities:

* Web scraping
* Background jobs
* AI processing
* Data updates

Because storage is extremely limited, avoid storing large files here.

---

# Final Architecture

```
                    Users

                      |

                distromap.dev

                      |

                 Cloudflare

                      |

             Cloudflare Tunnel

                      |

        +---------------------------+
        |                           |
        |       Server 1            |
        |    Main Application       |
        |                           |
        |  - Next.js                |
        |  - API                    |
        |  - PostgreSQL             |
        |  - Redis                  |
        |  - Reverse Proxy          |
        |                           |
        +-------------+-------------+

                      |

                 Tailscale

                      |

        +-------------+-------------+
        |                           |
        |       Server 2             |
        |      Worker Node           |
        |                            |
        |  - Scrapers                |
        |  - AI Processing           |
        |  - Data Jobs               |
        |                            |
        +----------------------------+
```

---

# Server 1 Setup

## Install Ubuntu Server

Recommended:

* Ubuntu Server 24.04 LTS
* Debian 13

Update system:

```bash
sudo apt update
sudo apt upgrade -y
```

---

# Install Docker

Install Docker:

```bash
curl -fsSL https://get.docker.com | sh
```

Install Docker Compose:

```bash
sudo apt install docker-compose-plugin
```

Check installation:

```bash
docker --version
docker compose version
```

---

# Create DistroMap Directory

```bash
sudo mkdir /opt/distromap
sudo chown $USER:$USER /opt/distromap

cd /opt/distromap
```

Project structure:

```
distromap/

├── frontend/
├── api/
├── database/
├── docker-compose.yml
├── .env
└── backups/
```

---

# Server 1 Services

Run:

## Frontend

Technology:

* Next.js
* React
* TypeScript
* Three.js
* React Three Fiber

Purpose:

* Interactive 3D Linux graph
* User interface
* Search
* Comparison tools

---

## API

Handles:

* Graph queries
* Search
* Authentication
* Recommendations
* Data access

---

## Database

Recommended:

PostgreSQL

Stores:

* Distribution data
* Releases
* Metadata
* Users

Optional:

Neo4j

Stores:

* Distribution relationships
* Fork history
* Ecosystem graph

---

## Redis

Used for:

* Caching
* Queue management
* Fast lookups

---

# Server 2 Setup

Install minimal Ubuntu Server.

Update:

```bash
sudo apt update
sudo apt upgrade -y
```

Install Docker:

```bash
curl -fsSL https://get.docker.com | sh
```

---

# Worker Services

Server 2 runs:

## Scraper Worker

Collects:

* Distribution information
* Release data
* Documentation
* GitHub information
* Package information

Technologies:

* Python
* Scrapy
* BeautifulSoup
* Playwright

---

## AI Processing Worker

Handles:

* Duplicate detection
* Relationship discovery
* Data cleaning
* Automatic tagging

Technologies:

* Python
* Sentence Transformers
* LLM APIs

---

# Connecting Servers

Use Tailscale.

Install:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
```

Start:

```bash
sudo tailscale up
```

Both servers will receive private addresses.

Example:

```
Server 1:
100.x.x.x

Server 2:
100.x.x.x
```

They can communicate securely without exposing internal services.

---

# Public Access

Use Cloudflare Tunnel.

Architecture:

```
Visitor

   |

Cloudflare

   |

Encrypted Tunnel

   |

Server 1
```

Benefits:

* No port forwarding
* HTTPS included
* Hides home IP
* DDoS protection

---

# Domain Setup

Example:

```
distromap.dev
```

DNS:

```
distromap.dev
        |
        |
Cloudflare Tunnel
        |
        |
Server 1
```

---

# Docker Services

Example:

```yaml
services:

  frontend:
    image: distromap/frontend

  api:
    image: distromap/api

  postgres:
    image: postgres

  redis:
    image: redis
```

---

# Backup Plan

Backup:

* Database
* Graph data
* Configuration files

Example:

```
backup/

├── postgres.sql
├── graph.json
├── configs/
└── docker-compose.yml
```

Store backups:

* External drive
* Cloud storage
* Git repository for configuration

---

# Monitoring

Recommended:

* Uptime Kuma
* Netdata
* Grafana
* Prometheus

Monitor:

* CPU usage
* RAM
* Storage
* Service uptime
* Database health

---

# Deployment Flow

```
Developer

   |

GitHub

   |

Server 1

   |

Docker Compose

   |

Production DistroMap
```

---

# Future Upgrades

Possible upgrades:

* More storage
* More RAM
* Dedicated database server
* GPU machine for AI
* Additional worker nodes
* Kubernetes/K3s cluster

---

# Final Goal

The finished system will provide:

* Interactive 3D Linux ecosystem map
* Automated distro discovery
* AI-powered relationships
* Search engine
* Comparison tools
* Historical timelines
* Real-time updates

The two-server setup creates a small but scalable foundation for a full Linux knowledge graph platform.
