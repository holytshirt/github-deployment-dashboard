# GitHub Repository Dashboard

This Next.js application provides a dashboard for viewing deployments and environments across multiple GitHub repositories. It allows users to select repositories and view their deployment and environment information in a single interface.

## Features

- Fetch and display a list of GitHub repositories for a specified user
- Allow multi-selection of repositories
- Display deployment information for selected repositories
- Show environment details for each selected repository

## How It Works

1. **Repository Fetching**: On initial load, the app fetches repositories for the GitHub user specified in the environment variables.

2. **Repository Selection**: Users can select multiple repositories from a dropdown menu.

3. **Data Retrieval**: Upon selection, the app fetches deployment and environment data for each selected repository.

4. **Dashboard Display**: The fetched data is displayed in a dashboard format, showing deployments and environments for each selected repository.

## Technical Details

- Built with Next.js and React
- Uses TypeScript for type safety
- Integrates with GitHub API using Octokit
- Utilizes react-select for multi-select functionality

## Environment Setup

The app requires the following environment variables:

- `GITHUB_TOKEN`: A personal access token for GitHub API authentication
- `GITHUB_USERNAME`: The GitHub username for which to fetch repositories

These should be set in a `.env.local` file in the root directory.

## Error Handling

The app includes error handling for API requests and displays user-friendly error messages when issues occur, such as authentication failures or not found errors.

## Getting Started

1. Clone the repository
2. Install dependencies with `npm install`
3. Set up your `.env.local` file with your GitHub token and username
4. Run the development server with `npm run dev`

Visit `http://localhost:3000` to view the app in your browser.
