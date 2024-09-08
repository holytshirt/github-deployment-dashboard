import { useState, useEffect, useCallback } from 'react';
import Select, { MultiValue } from 'react-select';
import { getRepositories, getDeployments, getEnvironments, initializeOctokit } from '../utils/github';
import Image from 'next/image';
import { useRouter } from 'next/router';

interface RepoOption {
  value: string;
  label: string;
  owner: string;
}

interface Deployment {
  id: number;
  sha: string;
  ref: string;
  task: string;
  environment: string;
  description: string;
  creator: {
    login: string;
    avatar_url: string;
  } | null;
  created_at: string;
  updated_at: string;
  statuses_url: string;
  repository_url: string;
  status?: string;
  releaseTag: string;
}

interface Environment {
  id: number;
  name: string;
}

interface DashboardData {
  [repo: string]: {
    deployments: Deployment[];
    environments: Environment[];
  };
}

export default function Home() {
  const [dashboardData, setDashboardData] = useState<DashboardData>({});
  const [repoOptions, setRepoOptions] = useState<RepoOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [selectedRepos, setSelectedRepos] = useState<RepoOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setIsClient(true);
    const token = localStorage.getItem('github_token');
    if (token) {
      initializeOctokit(token);
      setIsAuthenticated(true);
      fetchInitialData();
    } else {
      const { code } = router.query;
      if (code && typeof code === 'string') {
        exchangeCodeForToken(code);
      }
    }
  }, [router.query]);

  const exchangeCodeForToken = useCallback(async (code: string) => {
    try {
      const response = await fetch('/api/github-oauth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      });

      const data = await response.json();
      if (data.access_token) {
        localStorage.setItem('github_token', data.access_token);
        initializeOctokit(data.access_token);
        setIsAuthenticated(true);
        fetchInitialData();
      } else {
        throw new Error('Failed to obtain access token');
      }
    } catch (error) {
      console.error('Error exchanging code for token:', error);
      setError('Failed to authenticate with GitHub');
    }
  }, []);

  const fetchInitialData = useCallback(async () => {
    try {
      const repos = await getRepositories();
      setRepoOptions(repos);
      setError(null);
      
      const savedRepos = localStorage.getItem('selectedRepos');
      if (savedRepos) {
        const parsedRepos = JSON.parse(savedRepos) as RepoOption[];
        setSelectedRepos(parsedRepos);
        await refreshDashboard(parsedRepos);
      }
    } catch (err) {
      console.error('Error in fetchInitialData:', err);
      setError('Failed to fetch repositories. Please check the console for more details.');
    }
  }, []);

  const handleSignIn = async () => {
    try {
      const response = await fetch('/api/github-client-id');
      const { clientId } = await response.json();
      const redirectUri = `${window.location.origin}/`;
      window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=repo`;
    } catch (error) {
      console.error('Error fetching client ID:', error);
      setError('Failed to initiate GitHub sign-in');
    }
  };

  const refreshDashboard = async (repos: RepoOption[]) => {
    setIsLoading(true);
    try {
      const newDashboardData: DashboardData = {};
      for (const repo of repos) {
        const deployments = await getDeployments(repo.value);
        const environments = await getEnvironments(repo.value);
        newDashboardData[repo.value] = { deployments, environments };
      }
      setDashboardData(newDashboardData);
    } catch (error) {
      console.error('Error refreshing dashboard:', error);
      setError('Failed to refresh dashboard data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRepoSelection = async (selected: MultiValue<RepoOption>) => {
    const selectedRepos = selected as RepoOption[];
    setSelectedRepos(selectedRepos);
    localStorage.setItem('selectedRepos', JSON.stringify(selectedRepos));
    await refreshDashboard(selectedRepos);
  };

  const getStatusClass = (status: string) => {
    switch (status.toLowerCase()) {
      case 'success':
        return 'status-success';
      case 'failure':
      case 'error':
        return 'status-failure';
      case 'pending':
      case 'in_progress':
        return 'status-pending';
      case 'inactive':
        return 'status-inactive';
      default:
        return 'status-unknown';
    }
  };

  return (
    <div>
      <h1>GitHub Repository Dashboard</h1>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      {!isAuthenticated ? (
        <button onClick={handleSignIn}>Sign in with GitHub</button>
      ) : (
        <>
          <div className="select-container">
            {isClient && (
              <Select<RepoOption, true>
                instanceId="repo-select"
                isMulti
                options={repoOptions}
                value={selectedRepos}
                onChange={handleRepoSelection}
                isDisabled={isLoading}
              />
            )}
            {isLoading && (
              <div className="loading-indicator">
                <div className="spinner"></div>
                <span>Loading...</span>
              </div>
            )}
          </div>
          {!isLoading && Object.entries(dashboardData).map(([repo, data]) => (
            <div key={repo} className="repo-container">
              <h2>{repo}</h2>
              <h3>Deployments</h3>
              <div className="deployment-grid">
                {data.deployments.map((deployment) => (
                  <div key={deployment.id} className={`deployment-card ${getStatusClass(deployment.status || 'unknown')}`}>
                    <div className="deployment-header">
                      {deployment.creator && (
                        <>
                          <Image
                            src={deployment.creator.avatar_url}
                            alt={deployment.creator.login}
                            width={32}
                            height={32}
                            className="avatar"
                          />
                          <span>{deployment.creator.login}</span>
                        </>
                      )}
                    </div>
                    <div className="deployment-body">
                      <p><strong>Environment:</strong> {deployment.environment}</p>
                      <p><strong>Version:</strong> {deployment.sha.substring(0, 7)}</p>
                      {deployment.releaseTag && (
                        <p><strong>Release Tag:</strong> {deployment.releaseTag}</p>
                      )}
                      <p><strong>Description:</strong> {deployment.description || 'No description provided'}</p>
                      <p><strong>Deployed at:</strong> {new Date(deployment.created_at).toLocaleString()}</p>
                      <p>
                        <strong>Status:</strong> 
                        <span className={`status-indicator ${getStatusClass(deployment.status || 'unknown')}`}></span>
                        {deployment.status || 'Unknown'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <h3>Environments</h3>
              <ul>
                {data.environments.map((env) => (
                  <li key={env.id}>{env.name}</li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </div>
  );
}