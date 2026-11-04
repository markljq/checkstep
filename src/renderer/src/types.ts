export interface Step {
  id: string
  content: string
  done: boolean
}

export interface Task {
  id: string
  title: string
  note: string
  done: boolean
  doneAt: string | null
  steps: Step[]
}

export interface Milestone {
  id: string
  name: string
  tasks: Task[]
}

export interface Project {
  id: string
  name: string
  desc: string
  milestones: Milestone[]
}

export type AppMode = 'execute' | 'edit'
export type Theme = 'dark' | 'light'
export type AccentKey = 'blue' | 'teal' | 'purple' | 'pink' | 'orange' | 'green' | 'gold' | 'red'

export interface DB {
  projects: Project[]
  currentProjectId: string
  mode: AppMode
  theme: Theme
  accent: AccentKey
  /** 是否已看过首次使用指引 */
  guideSeen?: boolean
}
