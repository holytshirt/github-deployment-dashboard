import { useState, useEffect } from 'react';
import Select, { MultiValue } from 'react-select';
import { getRepositories, getDeployments, getEnvironments } from '../utils/github';

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

  useEffect(() => {
    setIsClient(true);
    console.log('GITHUB_TOKEN:', process.env.GITHUB_TOKEN ? 'Set' : 'Not set');

    const fetchRepos = async () => {
      try {
        console.log('Fetching repositories');
        const repos = await getRepositories();
        setRepoOptions(repos);
        setError(null);
      } catch (err) {
        console.error('Error in fetchRepos:', err);
        setError('Failed to fetch repositories. Please check the console for more details.');
      }
    };
    fetchRepos();
  }, []);

  const handleRepoSelection = async (selected: MultiValue<RepoOption>) => {
    try {
      const data: DashboardData = {};
      for (const repo of selected) {
        console.log(`Fetching data for ${repo.value}`);
        const deployments = await getDeployments(repo.value);
        const environments = await getEnvironments(repo.value);
        data[repo.value] = { 
          deployments: deployments as Deployment[], 
          environments
        };
      }
      setDashboardData(data);
      setError(null);
    } catch (err) {
      console.error('Error in handleRepoSelection:', err);
      setError('Failed to fetch repository data. Please check the console for more details.');
    }
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
      {isClient && (
        <Select<RepoOption, true>
          instanceId="repo-select"
          isMulti
          options={repoOptions}
          onChange={handleRepoSelection}
        />
      )}
      {Object.entries(dashboardData).map(([repo, data]) => (
        <div key={repo} className="repo-container">
          <h2>{repo}</h2>
          <h3>Deployments</h3>
          <div className="deployment-grid">
            {data.deployments.map((deployment) => (
              <div key={deployment.id} className={`deployment-card ${getStatusClass(deployment.status || 'unknown')}`}>
                <div className="deployment-header">
                  {deployment.creator && (
                    <>
                      <img src={deployment.creator.avatar_url} alt={deployment.creator.login} className="avatar" />
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
    </div>
  );
}