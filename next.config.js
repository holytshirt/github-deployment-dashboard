module.exports = {
    output: 'export',
    env: {
        GITHUB_TOKEN: process.env.GITHUB_TOKEN,
        GITHUB_USERNAME: process.env.GITHUB_USERNAME,
    },
    images: {
        domains: ['avatars.githubusercontent.com'],
        unoptimized: true,
    },
}