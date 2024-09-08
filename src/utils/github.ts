import { Octokit } from "@octokit/rest";

let octokit: Octokit | null = null;

export const initializeOctokit = (accessToken: string) => {
  octokit = new Octokit({ auth: accessToken });
};

const ensureOctokit = () => {
  if (!octokit) throw new Error("Octokit not initialized");
  return octokit;
};

export const getRepositories = async () => {
  const client = ensureOctokit();
  try {
    console.log('Fetching repositories');
    const { data } = await client.repos.listForAuthenticatedUser({
      sort: 'updated',
      per_page: 100,
    });
    console.log(`Successfully fetched ${data.length} repositories`);
    return data.map(repo => ({ 
      value: repo.full_name, 
      label: repo.full_name,
      owner: repo.owner.login,
    }));
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
  try {
    const { data } = await client.repos.listDeployments({ owner, repo });
    const deployments = await Promise.all(data.map(async (deployment) => {
      const { data: deploymentStatus } = await client.repos.listDeploymentStatuses({
        owner,
        repo,
        deployment_id: deployment.id
      });
      
      // Fetch release tag
      let releaseTag = '';
      try {
        const { data: release } = await client.repos.getReleaseByTag({
          owner,
          repo,
          tag: deployment.ref
        });
        releaseTag = release.tag_name;
      } catch (error) {
        console.log(`No release found for ref: ${deployment.ref}`);
      }

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
        status: deploymentStatus[0]?.state || 'unknown',
        releaseTag: releaseTag
      };
    }));

    // Group deployments by environment
    const groupedDeployments: { [env: string]: Deployment[] } = {};
    deployments.forEach(deployment => {
      if (!groupedDeployments[deployment.environment]) {
        groupedDeployments[deployment.environment] = [];
      }
      groupedDeployments[deployment.environment].push(deployment);
    });

    // Sort deployments within each environment by created_at (newest first)
    Object.values(groupedDeployments).forEach(envDeployments => {
      envDeployments.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    });

    return Object.entries(groupedDeployments).map(([environment, deployments]) => ({
      environment,
      deployments
    }));
  } catch (error) {
    console.error(`Error fetching deployments for ${full_name}:`, error);
    throw error;
  }
};

export const getEnvironments = async (full_name: string) => {
  const client = ensureOctokit();
  const [owner, repo] = full_name.split('/');
  try {
    const { data } = await client.repos.getAllEnvironments({ owner, repo });
    return data.environments || [];
  } catch (error) {
    console.error(`Error fetching environments for ${full_name}:`, error);
    throw error;
  }
};