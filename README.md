# Prometheus and Grafana Monitoring Project

Project page: https://roadmap.sh/projects/monitoring

A complete monitoring stack for a small web server. Prometheus collects metrics, Grafana visualizes them, and Alertmanager sends notifications to Discord.

The monitored server runs a Node.js app behind Nginx on Ubuntu 24.04 (ARM64). It runs in a Multipass VM on a MacBook, and the same steps work on any cloud VM.

## What is monitored

| Layer | Source | Examples |
|---|---|---|
| System | `node_exporter` | CPU, memory, disk, network |
| Web server | `nginx-prometheus-exporter` (via `stub_status`) | active connections, requests per second |
| Application | `prom-client` inside the Node.js app | request counts by route and status, latency histogram, orders created, queue size |
| Custom | Python exporter (`exporter/exporter.py`) | site up/down, HTTP status code, response time |
| Monitoring itself | Prometheus and Alertmanager | scrape health, rule evaluation |

## Architecture

    Browser (Mac)
       |  :3000 Grafana   :9090 Prometheus   :9093 Alertmanager   :80 demo app
       v
    +---------------------- Ubuntu VM "monitor" ----------------------+
    |  Nginx :80 --proxy--> Node.js app :4000 (/metrics, localhost)   |
    |     +-- stub_status :8080 (localhost only)                      |
    |                                                                 |
    |  node_exporter :9100   nginx_exporter :9113   site_exporter :9877|
    |        +----------------------+------------------+              |
    |                               v  scrape every 15s              |
    |                     Prometheus :9090 --alerts--> Alertmanager   |
    |                               ^                       |         |
    |                          Grafana :3000                v         |
    +---------------------------------------------------Discord------+

## Ports

| Port | Service | Exposed to |
|---|---|---|
| 80 | Nginx (reverse proxy to the app) | all |
| 3000 | Grafana | all |
| 9090 | Prometheus | all |
| 9093 | Alertmanager | all |
| 4000, 8080, 9100, 9113, 9877 | app, stub_status, exporters | localhost only |

## Repository layout

    prometheus/
      prometheus.yml          scrape config, rule files, Alertmanager link
      rules/alerts.yml        5 alert rules
      rules/recording.yml     4 recording rules
      targets/web.json        file-based service discovery targets
    alertmanager/alertmanager.yml   routing to Discord (webhook kept in a separate file)
    nginx/myapp.conf          reverse proxy and private stub_status
    app/server.js             Node.js demo app with custom metrics
    app/loadgen.sh            traffic generator (about 7% of requests fail on purpose)
    exporter/exporter.py      custom Python site-probe exporter
    systemd/                  service unit for every component
    dashboards/               exported Grafana dashboards (JSON)
    screenshots/              evidence of each requirement

## Setup summary

1. **VM.** `brew install --cask multipass`, then `multipass launch 24.04 --name monitor --cpus 2 --memory 2G --disk 20G`.
2. **App and Nginx.** Install Node.js and Nginx. Run `app/server.js` as a systemd service. Use `nginx/myapp.conf` (it blocks `/metrics` from outside and exposes `stub_status` on localhost only).
3. **Exporters.** Install `node_exporter` and `nginx-prometheus-exporter` (arm64 builds) as systemd services bound to `127.0.0.1`.
4. **Prometheus.** Install the binary, copy `prometheus/` to `/etc/prometheus/`, and run it as a service. Retention is set with flags: `--storage.tsdb.retention.time=15d` and `--storage.tsdb.retention.size=5GB`.
5. **Alertmanager.** Install, create a Discord webhook, and store its URL in `/etc/alertmanager/discord_webhook` (mode 600, never committed).
6. **Grafana.** Install from the official apt repository, add Prometheus (`http://localhost:9090`) as a data source, and import the dashboards.
7. **Validate before applying** any change: `promtool check config`, `promtool check rules`, `amtool check-config`.

## Prometheus

- Global scrape and evaluation interval: 15 seconds.
- Jobs: `prometheus`, `node`, `nginx`, `myapp`, `alertmanager`, `site-exporter`, and `file-sd-demo` (file-based discovery).
- Retention: 15 days or 5 GB, whichever limit is reached first.

## Grafana

- **Node Exporter Full** (community dashboard ID 1860): CPU, memory, disk and network overview.
- **Application Overview** (built from PromQL): requests per second by route, error rate, p95 latency, orders per minute, queue size, Nginx connections and requests, disk usage, and the site-exporter panels.
- **Authentication and authorization:** sign-up disabled; users `viewer1` (Viewer) and `editor1` (Editor); team `devs` with Edit rights on the `Monitoring` folder; everyone else View only.

## Alerting

Prometheus rules (`prometheus/rules/alerts.yml`):

| Alert | Condition | For | Severity |
|---|---|---|---|
| InstanceDown | `up == 0` | 1m | critical |
| HighCPU | CPU above 80% | 5m | warning |
| LowMemory | less than 10% memory available | 5m | warning |
| DiskAlmostFull | less than 15% free on `/` | 10m | warning |
| HighErrorRate | more than 5% of requests return 5xx | 2m | critical |

Notifications: Prometheus -> Alertmanager -> Discord (firing and resolved messages). In Grafana, a `discord-alerts` contact point and a Grafana-managed rule ("Grafana - High error rate") cover the Grafana-side requirement.

## Recording rules

| Rule | Purpose |
|---|---|
| `instance:node_cpu_utilisation:percent` | CPU busy percentage |
| `route:myapp_http_requests:rate5m` | requests per second by route |
| `route:myapp_http_request_duration_seconds:p95_5m` | p95 latency by route |
| `job:myapp_http_error_ratio:rate5m` | share of failing requests |

They follow the `level:metric:operations` naming convention and keep dashboard queries cheap.

## Service discovery

`file_sd_configs` watches `prometheus/targets/*.json`. Editing the JSON adds or removes targets within 30 seconds, with no Prometheus reload. In a real environment this job would replace the static jobs. On cloud platforms the same idea uses `digitalocean_sd_configs`, `ec2_sd_configs` or `kubernetes_sd_configs`.

## Custom exporter

`exporter/exporter.py` uses the Python `prometheus_client` library. It probes a list of URLs every 15 seconds and publishes `site_up`, `site_http_status_code` and `site_response_seconds`, labelled by URL.

## Screenshots

| Evidence | File |
|---|---|
| All targets UP, including file-sd and site-exporter | `screenshots/01-targets.png` |
| Alert rules and a firing alert | `screenshots/02-alerts.png` |
| Recording rule results | `screenshots/03-recording-rules.png` |
| Alertmanager with an active alert | `screenshots/04-alertmanager.png` |
| Node Exporter Full dashboard | `screenshots/05-node-dashboard.png` |
| Application Overview dashboard | `screenshots/06-app-dashboard.png` |
| Grafana data source test | `screenshots/07-datasource.png` |
| Users and folder permissions | `screenshots/08-users-permissions.png` |
| Grafana contact point and alert rule | `screenshots/09-grafana-alerting.png` |
| Discord channel with firing and resolved alerts | `screenshots/10-discord.png` |

## Security notes

- Exporters and the app listen on `127.0.0.1` only. Only Prometheus, Alertmanager, Grafana and Nginx are reachable from outside.
- Nginx returns 404 for `/metrics` on the public port.
- Secrets (the Discord webhook) live in root-owned files with mode 600 and are not in this repository.
- This is a lab setup without HTTPS. For production, put Grafana behind TLS, restrict Prometheus and Alertmanager with a firewall or authentication, and enable Grafana's stricter password and session settings.

## Lessons learned

- The VM clock drifts whenever the host Mac sleeps. This shifts graphs and alert timing, so it needs a resync (`multipass exec monitor -- sudo date -s "@$(date +%s)"`) or `caffeinate` while working.
- Running a duplicate scrape of an existing exporter (the discovery demo) produced duplicate series in dashboards. Filter panel queries by `job`, or let discovery replace the static job.
- Always run `promtool check config` before reloading Prometheus.

## Possible next steps

- Add Loki with Grafana Alloy for log aggregation and correlate logs with metrics.
- Add `mysqld_exporter` or `mongodb_exporter` for database monitoring.
- Add HTTPS and authentication in front of Prometheus and Alertmanager.
