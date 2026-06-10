# Docker Setup for OC World Record Museum

This guide explains how to run the OC World Record Museum using Docker and Portainer.

## Overview

The Docker setup includes two services:

1. **Admin Service** (`admin`) - Web interface for managing records at `http://localhost:7373`
2. **Web Preview Service** (`web`) - Static site preview at `http://localhost:8080`

## Quick Start

### Using Docker Compose (Recommended)

```bash
# Build and start both services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Using Portainer

1. Open Portainer web interface
2. Navigate to **Stacks** → **Add stack**
3. Choose **Repository** or **Upload** method:
   - **Repository**: Point to this Git repository
   - **Upload**: Upload the `docker-compose.yml` file
4. Click **Deploy the stack**

## Services

### Admin Service (Port 7373)

- **Purpose**: Edit and manage world records
- **URL**: http://localhost:7373
- **Features**:
  - Add/edit/delete records
  - Upload images
  - Manage overclockers
  - Bulk editing tools
- **Volume Mount**: The entire repository is mounted, so all changes are saved to your local files

### Web Preview Service (Port 8080)

- **Purpose**: Preview the static site before publishing
- **URL**: http://localhost:8080
- **Note**: This service rebuilds the site on container start. To see changes after editing records, rebuild the container:

```bash
docker-compose up -d --build web
```

## Workflow

### Local Development Workflow

1. **Start the services**:
   ```bash
   docker-compose up -d
   ```

2. **Edit records** via the admin interface at http://localhost:7373

3. **Preview changes** at http://localhost:8080 (rebuild if needed):
   ```bash
   docker-compose up -d --build web
   ```

4. **Commit and push** your changes:
   ```bash
   git add .
   git commit -m "Updated records"
   git push origin main
   git push gitea main
   ```

5. Your public website will update automatically via GitHub Pages or your CI/CD pipeline

## Port Configuration

Default ports:
- Admin: `7373`
- Web Preview: `8080`

To change ports, edit `docker-compose.yml`:

```yaml
ports:
  - "YOUR_PORT:7373"  # Admin
  - "YOUR_PORT:80"    # Web
```

## Troubleshooting

### Admin service won't start

Check if port 7373 is already in use:
```bash
# Windows
netstat -ano | findstr :7373

# Linux/Mac
lsof -i :7373
```

### Changes not showing in web preview

Rebuild the web service:
```bash
docker-compose up -d --build web
```

### Permission issues (Linux/Mac)

If you encounter permission issues with mounted volumes:
```bash
# Fix ownership
sudo chown -R $USER:$USER .
```

### View container logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f admin
docker-compose logs -f web
```

## Building Individual Services

### Build admin service only
```bash
docker build -f Dockerfile.admin -t oc-museum-admin .
docker run -d -p 7373:7373 -v $(pwd):/app oc-museum-admin
```

### Build web service only
```bash
docker build -f Dockerfile.web -t oc-museum-web .
docker run -d -p 8080:80 oc-museum-web
```

## Production Deployment

For production deployment of the static site:

1. The web service is production-ready with nginx
2. Configure your reverse proxy to point to the container
3. Update `BASE_URL` in `build.py` if needed
4. Consider using a proper domain and SSL certificate

## Health Checks

Both services include health checks:
- **Admin**: Checks if the Python server responds on port 7373
- **Web**: Checks if nginx serves the site on port 80

View health status:
```bash
docker-compose ps
```

## Updating

To update the containers after pulling new code:

```bash
git pull
docker-compose up -d --build
```

## Cleanup

Remove containers and networks:
```bash
docker-compose down
```

Remove containers, networks, and images:
```bash
docker-compose down --rmi all
```

## Requirements

- Docker Engine 20.10+
- Docker Compose 2.0+
- 2GB free disk space (for images and build cache)

## Support

For issues related to:
- **Docker setup**: Check this file and container logs
- **Application bugs**: See main README.md and CONTRIBUTING.md
- **Record submissions**: See CONTRIBUTING.md
