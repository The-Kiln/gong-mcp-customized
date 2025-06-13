# Deployment Guide for Enhanced Gong MCP Server

This guide provides instructions for deploying your Enhanced Gong MCP Server to various hosting platforms so it can be used with Anthropic's AI assistants.

## Prerequisites

- Node.js 20.0.0 or later
- Your Gong API credentials (Access Key and Secret)
- A hosting account on one of the platforms below

## General Deployment Steps

Regardless of which platform you choose, follow these general steps:

1. Build your application locally:
   ```bash
   pnpm install
   pnpm build
   ```

2. Test your application locally:
   ```bash
   pnpm start:enhanced
   ```

3. Create a `.env` file with your credentials (this is for local testing only)

4. Add environment variables to your hosting platform:
   - `GONG_ACCESS_KEY`: Your Gong API access key
   - `GONG_SECRET`: Your Gong API secret
   - `PORT`: Optional port number (defaults to 3000)

## Option 1: Deploying to Heroku

1. Create a Heroku account if you don't have one
2. Install the Heroku CLI
3. Create a new Heroku app:
   ```bash
   heroku create your-gong-mcp-server
   ```
4. Add your environment variables:
   ```bash
   heroku config:set GONG_ACCESS_KEY=your-access-key
   heroku config:set GONG_SECRET=your-secret
   ```
5. Deploy your code:
   ```bash
   git push heroku main
   ```
6. Your MCP server will be available at: `https://your-gong-mcp-server.herokuapp.com`

## Option 2: Deploying to AWS Elastic Beanstalk

1. Create an AWS account if you don't have one
2. Install the AWS CLI and EB CLI
3. Initialize your EB application:
   ```bash
   eb init
   ```
4. Create an environment:
   ```bash
   eb create gong-mcp-environment
   ```
5. Set your environment variables:
   ```bash
   eb setenv GONG_ACCESS_KEY=your-access-key GONG_SECRET=your-secret
   ```
6. Deploy your application:
   ```bash
   eb deploy
   ```
7. Your MCP server will be available at the URL provided by Elastic Beanstalk

## Option 3: Deploying to Railway

1. Create a Railway account
2. Connect your GitHub repository
3. Create a new project from your repository
4. Add environment variables in the Railway dashboard:
   - `GONG_ACCESS_KEY`
   - `GONG_SECRET`
5. Set the start command to: `node enhanced-server.js`
6. Deploy your application
7. Your MCP server will be available at the URL provided by Railway

## Option 4: Deploying to Render

1. Create a Render account
2. Connect your GitHub repository
3. Create a new Web Service
4. Configure the service:
   - Build Command: `npm install && npm run build`
   - Start Command: `node enhanced-server.js`
5. Add environment variables:
   - `GONG_ACCESS_KEY`
   - `GONG_SECRET`
6. Deploy your application
7. Your MCP server will be available at the URL provided by Render

## Configuring Anthropic to Use Your MCP Server

Once you have deployed your MCP server, you need to configure Anthropic to use it:

1. Log in to your Anthropic account
2. Navigate to the MCP configuration section
3. Add a new MCP server with:
   - Name: Gong MCP
   - URL: Your deployed server URL (e.g., `https://your-gong-mcp-server.herokuapp.com/api/mcp`)
   - Authentication: None (your server handles authentication to Gong)
4. Save your configuration

Now you should be able to use natural language queries in Claude to analyze your Gong call data!

## Testing Your Deployment

After deployment, test your server with a simple health check:

```bash
curl https://your-deployed-server.com/health
```

You should receive a JSON response with the server status.

## Troubleshooting

- **503 Service Unavailable**: Check your hosting platform's logs
- **401 Unauthorized**: Verify your Gong credentials are correctly set
- **Memory Issues**: Increase the memory allocation on your hosting platform
- **Timeout Errors**: Adjust the timeout settings for your hosting platform

## Maintenance

- Regularly update your dependencies
- Monitor your server logs for errors
- Check your hosting platform's dashboard for resource usage
- Set up alerts for when your server goes down