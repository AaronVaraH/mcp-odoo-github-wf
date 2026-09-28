import { simpleGit, SimpleGit } from 'simple-git';
import { GitRepoStatus, GitEnvironmentDetails } from './types.js';

export class GitManager {
  private git: SimpleGit;
  private basePath: string;

  constructor(basePath: string = process.cwd()) {
    this.basePath = basePath;
    this.git = simpleGit(basePath);
  }

  public async isGitRepo(): Promise<boolean> {
    try {
      return await this.git.checkIsRepo();
    } catch {
      return false;
    }
  }

  /**
   * Retrieves current repository status including branch, last commit, and uncommitted files
   */
  public async getRepoStatus(): Promise<GitRepoStatus> {
    const isRepo = await this.isGitRepo();
    if (!isRepo) {
      throw new Error(`Directory "${this.basePath}" is not a valid Git repository.`);
    }

    const [branchSummary, statusResult, logResult] = await Promise.all([
      this.git.branchLocal(),
      this.git.status(),
      this.git.log({ maxCount: 1 }).catch(() => null),
    ]);

    const modifiedFiles = [
      ...statusResult.not_added,
      ...statusResult.created,
      ...statusResult.modified,
      ...statusResult.deleted,
      ...statusResult.staged,
    ];

    const latest = logResult && logResult.latest ? logResult.latest : undefined;

    return {
      currentBranch: branchSummary.current,
      latestCommit: latest?.hash,
      latestCommitMessage: latest?.message,
      modifiedFiles: Array.from(new Set(modifiedFiles)),
      isClean: statusResult.isClean(),
    };
  }

  /**
   * Creates a branch if it does not exist, and checks it out.
   */
  public async checkoutOrCreateBranch(
    branchName: string,
    baseBranch?: string
  ): Promise<{ success: boolean; branch: string; isNew: boolean; message: string }> {
    const isRepo = await this.isGitRepo();
    if (!isRepo) {
      throw new Error(
        `Cannot create Git branch: "${this.basePath}" is not a Git repository. Run "git init" first.`
      );
    }

    const branchSummary = await this.git.branchLocal();
    const branchExists = branchSummary.all.includes(branchName);

    if (branchExists) {
      await this.git.checkout(branchName);
      return {
        success: true,
        branch: branchName,
        isNew: false,
        message: `Checked out existing branch "${branchName}".`,
      };
    }

    if (baseBranch) {
      const baseExists = branchSummary.all.includes(baseBranch);
      if (baseExists) {
        await this.git.checkout(baseBranch);
      }
    }

    await this.git.checkoutLocalBranch(branchName);

    return {
      success: true,
      branch: branchName,
      isNew: true,
      message: `Created and checked out new branch "${branchName}".`,
    };
  }

  /**
   * Retrieves high-level environment details (user, repo, remote origin)
   */
  public async getEnvironmentDetails(): Promise<GitEnvironmentDetails> {
    const isRepo = await this.isGitRepo();
    if (!isRepo) {
      return {
        isRepo: false,
        basePath: this.basePath,
      };
    }

    try {
      const [branchSummary, statusResult, userName, userEmail, remotes] = await Promise.all([
        this.git.branchLocal(),
        this.git.status(),
        this.git.raw(['config', 'user.name']).catch(() => ''),
        this.git.raw(['config', 'user.email']).catch(() => ''),
        this.git.getRemotes(true).catch(() => []),
      ]);

      const origin = remotes.find((r) => r.name === 'origin');
      const originUrl = origin?.refs?.fetch || origin?.refs?.push;

      return {
        isRepo: true,
        basePath: this.basePath,
        currentBranch: branchSummary.current,
        gitUserName: userName.trim() || undefined,
        gitUserEmail: userEmail.trim() || undefined,
        remoteOriginUrl: originUrl,
        isClean: statusResult.isClean(),
      };
    } catch {
      return {
        isRepo: true,
        basePath: this.basePath,
      };
    }
  }
}

