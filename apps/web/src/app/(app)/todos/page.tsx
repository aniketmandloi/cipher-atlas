"use client";

import { Button, Checkbox } from "@cipher-atlas/ui/components/motion";
import { Input } from "@cipher-atlas/ui/components/input";
import { Magnetic, ScrollReveal } from "@cipher-atlas/ui/components/motion";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { trpc } from "@/utils/trpc";

type TodoId = number;

export default function TodosPage() {
  const [newTodoText, setNewTodoText] = useState("");

  const todos = useQuery(trpc.todo.getAll.queryOptions());
  const createMutation = useMutation(
    trpc.todo.create.mutationOptions({
      onSuccess: () => {
        todos.refetch();
        setNewTodoText("");
      },
    }),
  );
  const toggleMutation = useMutation(
    trpc.todo.toggle.mutationOptions({
      onSuccess: () => todos.refetch(),
    }),
  );
  const deleteMutation = useMutation(
    trpc.todo.delete.mutationOptions({
      onSuccess: () => todos.refetch(),
    }),
  );

  const handleAddTodo = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (newTodoText.trim()) createMutation.mutate({ text: newTodoText });
  };

  const handleToggleTodo = (id: TodoId, completed: boolean) => {
    toggleMutation.mutate({ id, completed: !completed });
  };

  const handleDeleteTodo = (id: TodoId) => {
    deleteMutation.mutate({ id });
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <ScrollReveal>
        <div className="pb-10">
          <p className="text-sm text-muted-foreground">Tasks</p>
          <h1 className="mt-2 font-display text-4xl font-medium tracking-tight">Todos</h1>
        </div>
      </ScrollReveal>

      <div className="mx-auto mt-10 max-w-lg">
        <ScrollReveal delay={0.08}>
          <form onSubmit={handleAddTodo} className="flex items-center gap-3">
            <Input
              value={newTodoText}
              onChange={(e) => setNewTodoText(e.target.value)}
              placeholder="Add a new task…"
              disabled={createMutation.isPending}
              className="h-10 rounded-lg border-border bg-transparent"
            />
            <Magnetic strength={0.2}>
              <Button
                type="submit"
                size="md"
                disabled={createMutation.isPending || !newTodoText.trim()}
              >
                {createMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Add"
                )}
              </Button>
            </Magnetic>
          </form>
        </ScrollReveal>

        <div className="mt-6">
          {todos.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : todos.data?.length === 0 ? (
            <ScrollReveal delay={0.1}>
              <p className="py-10 text-center text-sm text-muted-foreground">
                No tasks yet. Add one above.
              </p>
            </ScrollReveal>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {todos.data?.map((todo, i) => (
                <li key={todo.id}>
                  <ScrollReveal delay={i * 0.05}>
                    <div className="flex items-center justify-between py-3.5">
                      <Checkbox
                        checked={todo.completed}
                        onCheckedChange={() => handleToggleTodo(todo.id, todo.completed)}
                        label={todo.text}
                        labelClassName={
                          todo.completed
                            ? "text-muted-foreground/50 line-through"
                            : "text-foreground/85"
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteTodo(todo.id)}
                        aria-label="Delete todo"
                        className="text-muted-foreground/50 hover:text-foreground"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </ScrollReveal>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
