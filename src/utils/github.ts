import { Octokit } from "@octokit/rest";

let octokit: Octokit | null = null;

export const initializeOctokit = (accessToken: string) => {
  octokit = new Octokit({ auth: accessToken });
};

const ensureOctokit = () => {
  if (!octokit) throw new Error("Octokit not initialized");
  return octokit;
};

// Simple in-memory cache
const cache: { [key: string]: { data: unknown; timestamp: number } } = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const getCachedData = <T>(key: string): T | null => {
  const cached = cache[key];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data as T;
  }
  return null;
};

const setCachedData = <T>(key: string, data: T) => {
  cache[key] = { data, timestamp: Date.now() };
};

export interface RepoOption {
  value: string;
  label: string;
  owner: string;
}

export const getRepositories = async () => {
  const client = ensureOctokit();
  const cacheKey = 'repositories';
  const cachedRepos = getCachedData<RepoOption[]>(cacheKey);
  if (cachedRepos) return cachedRepos;

  try {
    console.log('Fetching repositories');
    const repos: RepoOption[] = [];
    for await (const response of client.paginate.iterator(client.repos.listForAuthenticatedUser, {
      sort: 'updated',
      per_page: 100,
    })) {
      repos.push(...response.data.map(repo => ({
        value: repo.full_name,
        label: repo.full_name,
        owner: repo.owner.login,
      })));
    }
    console.log(`Successfully fetched ${repos.length} repositories`);
    setCachedData(cacheKey, repos);
    return repos;
  } catch (error) {
    console.error('Error fetching repositories:', error);
    throw error;
  }
};

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

export interface GroupedDeployment {
  environment: string;
  deployments: Deployment[];
}

export const getDeployments = async (full_name: string): Promise<GroupedDeployment[]> => {
  const client = ensureOctokit();
  const [owner, repo] = full_name.split('/');
  const cacheKey = `deployments-${full_name}`;
  const cachedDeployments = getCachedData<GroupedDeployment[]>(cacheKey);
  if (cachedDeployments) return cachedDeployments;

  try {
    const deployments: Deployment[] = [];
    for await (const response of client.paginate.iterator(client.repos.listDeployments, { owner, repo })) {
      const deploymentPromises = response.data.map(async (deployment) => {
        const [statusResponse, releaseResponse] = await Promise.all([
          client.repos.listDeploymentStatuses({ owner, repo, deployment_id: deployment.id }),
          client.repos.getReleaseByTag({ owner, repo, tag: deployment.ref }).catch(() => null)
        ]);

        return {
          id: deployment.id,
          sha: deployment.sha,
          ref: deployment.ref,
          task: deployment.task,
          environment: deployment.environment,
          description: deployment.description || '',
          creator: deployment.creator ? {
            login: deployment.creator.login,
            avatar_url: deployment.creator.avatar_url
          } : null,
          created_at: deployment.created_at,
          updated_at: deployment.updated_at,
          statuses_url: deployment.statuses_url,
          repository_url: deployment.repository_url,
          status: statusResponse.data[0]?.state || 'unknown',
          releaseTag: releaseResponse?.data.tag_name || ''
        };
      });

      deployments.push(...await Promise.all(deploymentPromises));
    }

    const groupedDeployments = deployments.reduce((acc, deployment) => {
      if (!acc[deployment.environment]) {
        acc[deployment.environment] = [];
      }
      acc[deployment.environment].push(deployment);
      return acc;
    }, {} as { [env: string]: Deployment[] });

    Object.values(groupedDeployments).forEach(envDeployments => {
      envDeployments.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    });

    const result = Object.entries(groupedDeployments).map(([environment, deployments]) => ({
      environment,
      deployments
    }));

    setCachedData(cacheKey, result);
    return result;
  } catch (error) {
    console.error(`Error fetching deployments for ${full_name}:`, error);
    throw error;
  }
};

export interface Environment {
  id: number;
  name: string;
}

export const getEnvironments = async (full_name: string) => {
  const client = ensureOctokit();
  const [owner, repo] = full_name.split('/');
  const cacheKey = `environments-${full_name}`;
  const cachedEnvironments = getCachedData<Environment[]>(cacheKey);
  if (cachedEnvironments) return cachedEnvironments;

  try {
    const { data } = await client.repos.getAllEnvironments({ owner, repo });
    const environments = data.environments || [];
    setCachedData(cacheKey, environments);
    return environments;
  } catch (error) {
    console.error(`Error fetching environments for ${full_name}:`, error);
    throw error;
  }
};