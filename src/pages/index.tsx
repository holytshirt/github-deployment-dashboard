import { useState, useEffect, useCallback, useMemo, createContext } from 'react';
import Select, { MultiValue } from 'react-select';
import { getRepositories, getDeployments, getEnvironments, initializeOctokit, RepoOption, Environment } from '../utils/github';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { FixedSizeList as List, ListChildComponentProps } from 'react-window';

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

interface GroupedDeployment {
  environment: string;
  deployments: Deployment[];
}

interface DashboardData {
  [repo: string]: {
    groupedDeployments: GroupedDeployment[];
    environments: Environment[];
  };
}

const GithubContext = createContext<{
  isAuthenticated: boolean;
  setIsAuthenticated: (value: boolean) => void;
  dashboardData: DashboardData;
  setDashboardData: (data: DashboardData) => void;
} | null>(null);

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [dashboardData, setDashboardData] = useState<DashboardData>({});
  const [repoOptions, setRepoOptions] = useState<RepoOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [selectedRepos, setSelectedRepos] = useState<RepoOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedEnvironments, setExpandedEnvironments] = useState<{[key: string]: boolean}>({});
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);

  const refreshDashboard = useCallback(async (repos: RepoOption[]) => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const newDashboardData: DashboardData = {};
      await Promise.all(repos.map(async (repo) => {
        const [groupedDeployments, environments] = await Promise.all([
          getDeployments(userId, repo.value),
          getEnvironments(userId, repo.value)
        ]);
        newDashboardData[repo.value] = { groupedDeployments, environments };
      }));
      setDashboardData(newDashboardData);
    } catch (error) {
      console.error('Error refreshing dashboard:', error);
      setError('Failed to refresh dashboard data');
    } finally {
      setIsLoading(false);
    }
  }, [userId, setDashboardData, setError, setIsLoading]);

  const fetchInitialData = useCallback(async () => {
    if (!userId) return;
    try {
      const repos = await getRepositories(userId);
      setRepoOptions(repos);
      setError(null);
      
      const savedRepos = localStorage.getItem(`selectedRepos-${userId}`);
      if (savedRepos) {
        const parsedRepos = JSON.parse(savedRepos) as RepoOption[];
        setSelectedRepos(parsedRepos);
        await refreshDashboard(parsedRepos);
      }
    } catch (err) {
      console.error('Error in fetchInitialData:', err);
      setError('Failed to fetch repositories. Please check the console for more details.');
    }
  }, [userId, refreshDashboard]);

  const exchangeCodeForToken = useCallback(async (code: string) => {
    try {
      const response = await fetch('/api/github-oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });

      const data = await response.json();
      if (data.access_token) {
        const newUserId = Math.random().toString(36).substring(7);
        setUserId(newUserId);
        localStorage.setItem('userId', newUserId);
        localStorage.setItem(`github_token-${newUserId}`, data.access_token);
        initializeOctokit(newUserId, data.access_token);
        setIsAuthenticated(true);
        fetchInitialData();
      } else {
        throw new Error('Failed to obtain access token');
      }
    } catch (error) {
      console.error('Error exchanging code for token:', error);
      setError('Failed to authenticate with GitHub');
    }
  }, [fetchInitialData]);

  useEffect(() => {
    setIsClient(true);
    const storedUserId = localStorage.getItem('userId');
    if (storedUserId) {
      setUserId(storedUserId);
      const token = localStorage.getItem(`github_token-${storedUserId}`);
      if (token) {
        initializeOctokit(storedUserId, token);
        setIsAuthenticated(true);
        fetchInitialData();
      }
    } else {
      const { code } = router.query;
      if (code && typeof code === 'string') {
        exchangeCodeForToken(code);
      }
    }
  }, [router.query, exchangeCodeForToken, fetchInitialData]);

  const handleSignIn = async () => {
    try {
      const response = await fetch('/api/github-client-id');
      const { clientId } = await response.json();
      const redirectUri = `${window.location.origin}/`;
      window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=repo:read`;
    } catch (error) {
      console.error('Error fetching client ID:', error);
      setError('Failed to initiate GitHub sign-in');
    }
  };

  const handleRepoSelection = async (selected: MultiValue<RepoOption>) => {
    if (!userId) return;
    const selectedRepos = selected as RepoOption[];
    setSelectedRepos(selectedRepos);
    localStorage.setItem(`selectedRepos-${userId}`, JSON.stringify(selectedRepos));
    await refreshDashboard(selectedRepos);
  };

  const getStatusClass = useMemo(() => (status: string) => {
    switch (status.toLowerCase()) {
      case 'success': return 'status-success';
      case 'failure':
      case 'error': return 'status-failure';
      case 'pending':
      case 'in_progress': return 'status-pending';
      case 'inactive': return 'status-inactive';
      default: return 'status-unknown';
    }
  }, []);

  const toggleEnvironment = useCallback((repo: string, environment: string) => {
    setExpandedEnvironments(prev => ({
      ...prev,
      [`${repo}-${environment}`]: !prev[`${repo}-${environment}`]
    }));
  }, []);

  const DeploymentCard = useCallback(({ deployment }: { deployment: Deployment }) => (
    <div className={`deployment-card ${getStatusClass(deployment.status || 'unknown')}`}>
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
  ), [getStatusClass]);

  const EnvironmentDeployments = useCallback(({ environment, deployments, repo }: GroupedDeployment & { repo: string }) => {
    const isExpanded = expandedEnvironments[`${repo}-${environment}`];
    const displayedDeployments = isExpanded ? deployments : [deployments[0]];

    return (
      <div className="environment-container">
        <h4 onClick={() => toggleEnvironment(repo, environment)} style={{ cursor: 'pointer' }}>
          {environment} ({deployments.length} deployments) {isExpanded ? '▼' : '▶'}
        </h4>
        <List
          height={isExpanded ? 300 : 200}
          itemCount={displayedDeployments.length}
          itemSize={200}
          width="100%"
        >
          {({ index, style }: ListChildComponentProps) => (
            <div style={style}>
              <DeploymentCard deployment={displayedDeployments[index]} />
            </div>
          )}
        </List>
      </div>
    );
  }, [expandedEnvironments, toggleEnvironment, DeploymentCard]);

  const contextValue = useMemo(() => ({
    isAuthenticated,
    setIsAuthenticated,
    dashboardData,
    setDashboardData
  }), [isAuthenticated, dashboardData]);

  return (
    <GithubContext.Provider value={contextValue}>
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
                  {data.groupedDeployments.map((groupedDeployment) => (
                    <EnvironmentDeployments 
                      key={`${repo}-${groupedDeployment.environment}`}
                      {...groupedDeployment}
                      repo={repo}
                    />
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
    </GithubContext.Provider>
  );
}