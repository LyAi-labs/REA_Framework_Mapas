module.exports = {
    apps: [
        {
            name: "rea-mapas-test-watch",
            script: "npm",
            args: "run test:watch",
            cwd: __dirname,
            autorestart: true,
            watch: false
        }
    ]
};
