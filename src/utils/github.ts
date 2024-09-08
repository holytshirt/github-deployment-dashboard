import { Octokit } from "@octokit/rest";

const octokitInstances: { [userId: string]: Octokit } = {};

export const initializeOctokit = (userId: string, accessToken: string) => {
  octokitInstances[userId] = new Octokit({ auth: accessToken });
};

const ensureOctokit = (userId: string) => {
  if (!octokitInstances[userId]) throw new Error("Octokit not initialized for this user");
  return octokitInstances[userId];
};

// Simple in-memory cache
const cache: { [userId: string]: { [key: string]: { data: unknown; timestamp: number } } } = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const getCachedData = <T>(userId: string, key: string): T | null => {
  const userCache = cache[userId];
  if (!userCache) return null;
  const cached = userCache[key];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data as T;
  }
  return null;
};

const setCachedData = <T>(userId: string, key: string, data: T) => {
  if (!cache[userId]) cache[userId] = {};
  cache[userId][key] = { data, timestamp: Date.now() };
};

export interface RepoOption {
  value: string;
  label: string;
  owner: string;
  isOrg: boolean;
}

export const getRepositories = async (userId: string) => {
  const client = ensureOctokit(userId);
  const cacheKey = 'repositories';
  const cachedRepos = getCachedData<RepoOption[]>(userId, cacheKey);
  if (cachedRepos) return cachedRepos;

  try {
    console.log('Fetching repositories');
    const repos: RepoOption[] = [];

    // Fetch all repositories the user has access to (including org repos)
    for await (const response of client.paginate.iterator(client.repos.listForAuthenticatedUser, {
      sort: 'updated',
      per_page: 100,
      affiliation: 'owner,collaborator,organization_member'
    })) {
      repos.push(...response.data.map(repo => ({
        value: repo.full_name,
        label: repo.full_name,
        owner: repo.owner.login,
        isOrg: repo.owner.type === 'Organization'
      })));
    }

    console.log(`Successfully fetched ${repos.length} repositories`);
    setCachedData(userId, cacheKey, repos);
    return repos;
  } catch (error) {
    console.error('Error fetching repositories:', error);
    return handleApiError(error, userId);
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

export const getDeployments = async (userId: string, full_name: string): Promise<GroupedDeployment[]> => {
  const client = ensureOctokit(userId);
  const [owner, repo] = full_name.split('/');
  const cacheKey = `deployments-${full_name}`;
  const cachedDeployments = getCachedData<GroupedDeployment[]>(userId, cacheKey);
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

    setCachedData(userId, cacheKey, result);
    return result;
  } catch (error) {
    console.error(`Error fetching deployments for ${full_name}:`, error);
    return handleApiError(error, userId);
  }
};

export interface Environment {
  id: number;
  name: string;
}

export const getEnvironments = async (userId: string, full_name: string) => {
  const client = ensureOctokit(userId);
  const [owner, repo] = full_name.split('/');
  const cacheKey = `environments-${full_name}`;
  const cachedEnvironments = getCachedData<Environment[]>(userId, cacheKey);
  if (cachedEnvironments) return cachedEnvironments;

  try {
    const { data } = await client.repos.getAllEnvironments({ owner, repo });
    const environments = data.environments || [];
    setCachedData(userId, cacheKey, environments);
    return environments;
  } catch (error) {
    console.error(`Error fetching environments for ${full_name}:`, error);
    return handleApiError(error, userId);
  }
};

const handleApiError = async (error: unknown, userId: string) => {
  if (error instanceof Error && 'status' in error) {
    if (error.status === 401) {
      // Remove the invalid token
      localStorage.removeItem(`github_token-${userId}`);
      // Remove the Octokit instance
      delete octokitInstances[userId];
      // Instead of redirecting, we'll throw a specific error
      throw new Error('AUTH_REQUIRED');
    } else if (error.status === 403 && error.message.includes('API rate limit exceeded')) {
      throw new Error('RATE_LIMIT_EXCEEDED');
    }
  }
  throw error;
};