"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { ArrowRight, FileText, LogOut, Plus, Search, SwatchBook } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import { ThemeToggle } from "@/components/theme/toggle";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useProjects } from "@/lib/use-projects";

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(timestamp);
}

export function DashboardPage() {
  const router = useRouter();
  const user = useQuery(api.users.current);
  const { projects, isLoading, createProject } = useProjects();
  const { handleSignOut, isLoading: isSigningOut } = useAuth();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const filteredProjects = useMemo(() => {
    const source = projects ?? [];
    const term = query.trim().toLowerCase();

    if (!term) return source;

    return source.filter((project) =>
      [project.name, project.description ?? "", ...(project.tags ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [projects, query]);

  const onCreate = async () => {
    setIsCreating(true);

    try {
      const projectId = await createProject({
        name,
        description: description.trim() || undefined,
      });
      setOpen(false);
      setName("");
      setDescription("");
      toast.success("Project created");
      router.push(`/dashboard/projects/${projectId}`);
    } catch (error) {
      console.error(error);
      toast.error("Could not create project");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <main suppressHydrationWarning className="min-h-svh bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="grid size-8 place-items-center rounded-md border border-border bg-muted text-sm font-semibold text-foreground">
              S
            </div>
            <div>
              <p className="text-sm font-semibold leading-none">S2C</p>
              <p className="mt-1 text-xs text-muted-foreground">Design workspace</p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-foreground">{user?.name ?? user?.email ?? "Account"}</p>
              <p className="text-xs text-muted-foreground">Learning project</p>
            </div>
            <ThemeToggle />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="size-8 rounded-md border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Sign out"
              suppressHydrationWarning
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-8">
        <div className="flex flex-col gap-5 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal text-foreground">Projects</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Create and organize sketch-to-code canvases as you move through the tutorial.
            </p>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="h-9 rounded-md px-3">
                <Plus className="size-4" />
                New project
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-lg border-border bg-card text-card-foreground sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create project</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Start with a blank canvas and save viewport, shapes, and references.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="project-name">Name</Label>
                  <Input
                    id="project-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Landing page concept"
                    className="border-border bg-background text-foreground placeholder:text-muted-foreground"
                    suppressHydrationWarning
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="project-description">Description</Label>
                  <Textarea
                    id="project-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Short project brief"
                    className="min-h-24 border-border bg-background text-foreground placeholder:text-muted-foreground"
                    suppressHydrationWarning
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  className="rounded-md"
                  onClick={onCreate}
                  disabled={isCreating}
                  suppressHydrationWarning
                >
                  {isCreating ? "Creating" : "Create and open"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search projects"
              className="h-9 rounded-md border-border bg-background pl-9 text-foreground placeholder:text-muted-foreground"
              suppressHydrationWarning
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {isLoading ? "Loading" : `${filteredProjects.length} project${filteredProjects.length === 1 ? "" : "s"}`}
          </p>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {isLoading &&
            Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-44 animate-pulse rounded-lg border border-border bg-card" />
            ))}

          {!isLoading && filteredProjects.length === 0 && (
            <div className="col-span-full grid min-h-72 place-items-center rounded-lg border border-dashed border-border bg-card p-10 text-center">
              <div className="max-w-sm">
                <div className="mx-auto grid size-11 place-items-center rounded-md border border-border bg-muted">
                  <FileText className="size-5 text-muted-foreground" />
                </div>
                <h2 className="mt-4 text-base font-semibold">No projects yet</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Create a project to open the canvas workspace.
                </p>
                <Button className="mt-5 h-9 rounded-md px-4" onClick={() => setOpen(true)}>
                  <Plus className="size-4" />
                  Create project
                </Button>
              </div>
            </div>
          )}

          {filteredProjects.map((project) => (
            <Link
              key={project._id}
              href={`/dashboard/projects/${project._id}`}
              className="group rounded-lg border border-border bg-card p-4 transition hover:border-foreground/20 hover:bg-muted/50"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-foreground">{project.name}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Project {project.projectNumber}</p>
                </div>
                <ArrowRight className="mt-0.5 size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>
              <p className="mt-4 line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">
                {project.description || "Blank canvas ready for frames, shapes, and viewport data."}
              </p>
              <div className="mt-5 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                <span>{formatDate(project.lastModified)}</span>
                <span className="inline-flex items-center gap-1"><SwatchBook className="size-3" />{project.moodBoardImages?.length ?? 0} refs</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}