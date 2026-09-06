'use client'

import { useState, useEffect } from 'react'
import { X, Minimize2 } from 'lucide-react'
import { ProjectStatus, PROJECT_STATUS_OPTIONS, PROJECT_ICONS, PROJECT_COLORS } from '@/types/enums'
import { RichTextEditor } from '@/components/ui/RichTextEditor'
import type { Project } from '@/payload-types'
import * as Icons from 'lucide-react'

interface ProjectModalProps {
  isOpen: boolean
  onClose: () => void
  project: Project | null
  onSave: (project: Project) => void
}

const iconMap: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  folder: Icons.Folder,
  rocket: Icons.Rocket,
  zap: Icons.Zap,
  star: Icons.Star,
  heart: Icons.Heart,
  flag: Icons.Flag,
  target: Icons.Target,
  briefcase: Icons.Briefcase,
  code: Icons.Code,
  box: Icons.Box,
  layers: Icons.Layers,
  database: Icons.Database,
}

export function ProjectModal({ isOpen, onClose, project, onSave }: ProjectModalProps) {
  const [name, setName] = useState('')
  const [prefix, setPrefix] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<ProjectStatus>(ProjectStatus.ACTIVE)
  const [icon, setIcon] = useState('folder')
  const [color, setColor] = useState('#6366f1')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isFullScreen, setIsFullScreen] = useState(true)

  useEffect(() => {
    if (project) {
      setName(project.name)
      setPrefix(project.prefix)
      setDescription(project.description as unknown as string || '')
      setStatus(project.status as ProjectStatus)
      setIcon(project.icon as string || 'folder')
      setColor(project.color as string || '#6366f1')
    } else {
      setName('')
      setPrefix('')
      setDescription('')
      setStatus(ProjectStatus.ACTIVE)
      setIcon('folder')
      setColor('#6366f1')
    }
    setError(null)
    setIsFullScreen(true)
  }, [project, isOpen])

  const handlePrefixChange = (value: string) => {
    setPrefix(value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !prefix.trim()) return

    setIsSubmitting(true)
    setError(null)

    try {
      const payload = {
        name: name.trim(),
        prefix: prefix.trim(),
        description: description || null,
        status,
        icon,
        color,
      }

      const url = project ? `/api/projects/${project.id}` : '/api/projects'
      const method = project ? 'PATCH' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.errors?.[0]?.message || 'Failed to save project')
      }

      const savedProject = await response.json()
      onSave(savedProject.doc || savedProject)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save project')
    } finally {
      setIsSubmitting(false)
    }
  }

  const IconComponent = iconMap[icon] || Icons.Folder

  if (!isOpen) return null

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 ${isFullScreen ? '' : 'p-4 sm:p-6'}`}>
      <div className="absolute inset-0" onClick={onClose} />

      <div
        className={`relative flex flex-col bg-card shadow-2xl overflow-hidden transition-all duration-300 ${
          isFullScreen
            ? 'w-full h-full max-w-none rounded-none'
            : 'w-full max-w-2xl mx-auto max-h-[90vh] rounded-xl border border-border/50'
        }`}
      >
        {/* Header */}
        <div className="flex-none flex items-center justify-between px-6 py-3 border-b border-border/30">
          <span className="text-sm text-muted-foreground">
            {project ? 'Edit Project' : 'New Project'}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsFullScreen(!isFullScreen)}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded-md transition-colors"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded-md transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <form id="project-form" onSubmit={handleSubmit} className={`${isFullScreen ? 'max-w-4xl mx-auto' : ''}`}>
            <div className={`flex ${isFullScreen ? 'gap-0' : 'flex-col'}`}>
              {/* Main Content */}
              <div className={`flex-1 p-8 ${isFullScreen ? 'pr-0' : ''}`}>
                {error && (
                  <div className="mb-6 bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-3 rounded-lg">
                    {error}
                  </div>
                )}

                {/* Icon & Name */}
                <div className="flex items-start gap-4 mb-6">
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${color}20` }}
                  >
                    <IconComponent className="w-7 h-7" style={{ color }} />
                  </div>
                  <div className="flex-1">
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Project name"
                      className="w-full bg-transparent text-2xl font-bold text-foreground placeholder:text-muted-foreground/40 border-none px-0 py-1 focus:ring-0 focus:outline-none"
                      autoFocus
                      required
                    />
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm text-muted-foreground">Prefix:</span>
                      <input
                        type="text"
                        value={prefix}
                        onChange={(e) => handlePrefixChange(e.target.value)}
                        placeholder="PROJ"
                        className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 border-none px-0 focus:ring-0 focus:outline-none w-20"
                        required
                        disabled={!!project}
                      />
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div className="mb-8">
                  <RichTextEditor
                    value={description}
                    onChange={setDescription}
                    placeholder="Describe the project goals, scope, and any important details..."
                  />
                </div>
              </div>

              {/* Sidebar */}
              <div className={`${isFullScreen ? 'w-72 border-l border-border/30 p-6 bg-secondary/10' : 'p-8 pt-0'}`}>
                <div className="space-y-6">
                  {/* Status */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-2 block">Status</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                      className="w-full bg-transparent border-none text-sm text-foreground focus:ring-0 p-0 cursor-pointer hover:text-primary transition-colors"
                    >
                      {PROJECT_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value} className="bg-card">
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Icon */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-3 block">Icon</label>
                    <div className="grid grid-cols-6 gap-1.5">
                      {PROJECT_ICONS.map((iconName) => {
                        const Icon = iconMap[iconName] || Icons.Folder
                        return (
                          <button
                            key={iconName}
                            type="button"
                            onClick={() => setIcon(iconName)}
                            className={`p-2 rounded-md transition-all ${
                              icon === iconName
                                ? 'bg-primary/20 text-primary'
                                : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Color */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-3 block">Color</label>
                    <div className="grid grid-cols-6 gap-2">
                      {PROJECT_COLORS.map((colorOption) => (
                        <button
                          key={colorOption}
                          type="button"
                          onClick={() => setColor(colorOption)}
                          className={`w-7 h-7 rounded-full transition-all ${
                            color === colorOption ? 'ring-2 ring-foreground ring-offset-2 ring-offset-card scale-110' : ''
                          }`}
                          style={{ backgroundColor: colorOption }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="flex-none flex justify-end gap-3 px-6 py-4 border-t border-border/30">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="project-form"
            disabled={isSubmitting || !name.trim() || !prefix.trim()}
            className="px-5 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-md transition-all disabled:opacity-50"
          >
            {isSubmitting ? 'Saving...' : project ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
