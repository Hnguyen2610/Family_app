# /pm2 - Service Lifecycle Management

## 🎯 Goal
Manage backend services, background jobs, and microservices using PM2.

## 🛠️ Instructions
1.  **Check Status**: Use `pm2 list` to see running processes.
2.  **Restart**: Use `pm2 restart {id|name}` to refresh a service after code changes.
3.  **Logs**: Use `pm2 logs {id|name}` to debug issues.
4.  **Save/Startup**: Ensure processes persist after reboot with `pm2 save`.

## 🏁 Workflow
1.  **Monitor**: Keep track of resource usage.
2.  **Scale**: Use `pm2 scale` for clustering if performance requires it.
3.  **Deploy**: Use `pm2 deploy` for zero-downtime releases.
