
{
  "version": 2,
  "builds": [
    {
      "src": "api/process.js",
      "use": "@vercel/node"
    },
    {
      "src": "public/**/*",
      "use": "@vercel/static"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/process.js"
    },
    {
      "src": "/(.*)",
      "dest": "/public/$1"
    },
    {
      "handle": "filesystem"
    },
    {
      "src": "/(.*)",
      "dest": "/process.js"
    }
  ]
}
