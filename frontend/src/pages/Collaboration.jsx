import React, { useCallback, useEffect, useMemo, useState } from "react";
import PageContainer from "@/components/layout/PageContainer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Loader2, MessageSquarePlus, ShieldCheck, Users } from "lucide-react";

import {
  createComment,
  createInvitation,
  createWorkspace,
  getAccessPolicies,
  listComments,
  listInvitations,
  listWorkspaces,
  revokeInvitation,
  updateAccessPolicy,
} from "@/api/collaboration";
import { getDatasets } from "@/api/entities";

const emptyCommentForm = {
  author: "",
  datasetId: "",
  widgetId: "",
  row: "",
  column: "",
  text: "",
  mentions: "",
};

const emptyWorkspaceForm = {
  name: "",
  createdBy: "",
  parentId: "",
  inheritPermissions: true,
  description: "",
};

function CommentTargetDetails({ target }) {
  if (!target) {
    return null;
  }

  const chips = [];
  if (target.dataset_id) {
    chips.push({ label: "Датасет", value: target.dataset_id });
  }
  if (target.widget_id) {
    chips.push({ label: "Виджет", value: target.widget_id });
  }
  if (target.row !== undefined && target.row !== null) {
    chips.push({ label: "Строка", value: target.row });
  }
  if (target.column) {
    chips.push({ label: "Столбец", value: target.column });
  }
  if (Array.isArray(target.data_point_path) && target.data_point_path.length > 0) {
    chips.push({ label: "Путь", value: target.data_point_path.join(" → ") });
  }

  if (chips.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">Комментарий к рабочему пространству</div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {chips.map((chip) => (
        <Badge key={`${chip.label}-${chip.value}`} variant="secondary" className="text-xs">
          <span className="font-medium text-foreground/70 mr-1">{chip.label}:</span>
          {chip.value}
        </Badge>
      ))}
    </div>
  );
}

function AssignmentList({ policy }) {
  if (!policy || !policy.assignments || policy.assignments.length === 0) {
    return <div className="text-sm text-muted-foreground">Назначения не заданы.</div>;
  }

  return (
    <div className="space-y-3">
      {policy.assignments.map((assignment) => (
        <Card key={assignment.id} className="border border-border/60">
          <CardContent className="py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold text-sm">{assignment.user_id}</div>
                <div className="text-xs text-muted-foreground">
                  Роль: <span className="font-medium uppercase">{assignment.role}</span>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {(assignment.tags || []).map((tag) => (
                  <Badge key={`${assignment.id}-tag-${tag}`} variant="outline" className="text-xs">
                    Тег: {tag}
                  </Badge>
                ))}
                {(assignment.folders || []).map((folder) => (
                  <Badge key={`${assignment.id}-folder-${folder}`} variant="secondary" className="text-xs">
                    Папка: {folder}
                  </Badge>
                ))}
                {(assignment.dataset_ids || []).map((datasetId) => (
                  <Badge key={`${assignment.id}-dataset-${datasetId}`} variant="default" className="text-xs">
                    Датасет: {datasetId}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function Collaboration() {
  const [workspaceData, setWorkspaceData] = useState({ count: 0, items: [] });
  const [policies, setPolicies] = useState([]);
  const [commentFeed, setCommentFeed] = useState({ count: 0, items: [] });
  const [datasets, setDatasets] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(null);
  const [commentForm, setCommentForm] = useState(emptyCommentForm);
  const [workspaceForm, setWorkspaceForm] = useState(emptyWorkspaceForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [invitationSubmitting, setInvitationSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [activeTab, setActiveTab] = useState("comments");
  const [includeInactiveInvitations, setIncludeInactiveInvitations] = useState(false);
  const [copiedInvitationId, setCopiedInvitationId] = useState(null);
  const [invitationForm, setInvitationForm] = useState({
    role: "viewer",
    datasetIds: [],
    createdBy: "",
    expiresInHours: 168,
  });

  const workspaces = workspaceData.items || [];
  const workspaceOptions = workspaces.map((item) => ({
    id: item.workspace.id,
    name: item.workspace.name,
  }));

  const activeWorkspaceId = useMemo(() => {
    if (selectedWorkspaceId) {
      return selectedWorkspaceId;
    }
    return workspaceOptions[0]?.id || null;
  }, [selectedWorkspaceId, workspaceOptions]);

  const activePolicy = useMemo(() => {
    if (!activeWorkspaceId) {
      return null;
    }
    return policies.find((item) => item.workspace_id === activeWorkspaceId) || null;
  }, [activeWorkspaceId, policies]);

  const invitationLinkBase = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return window.location.origin;
  }, []);

  const activeInvitationsCount = useMemo(() => {
    return invitations.filter((invitation) => invitation.status === "active").length;
  }, [invitations]);

  useEffect(() => {
    async function bootstrap() {
      setLoading(true);
      try {
        const [workspaceResponse, policiesResponse, datasetsResponse, commentsResponse] = await Promise.all([
          listWorkspaces(),
          getAccessPolicies(),
          getDatasets(),
          listComments(),
        ]);
        setWorkspaceData(workspaceResponse);
        setPolicies(policiesResponse || []);
        setDatasets(Array.isArray(datasetsResponse) ? datasetsResponse : []);
        setCommentFeed(commentsResponse || { count: 0, items: [] });
        setError(null);
      } catch (err) {
        console.error("Не удалось загрузить данные сотрудничества", err);
        setError("Ошибка загрузки данных. Попробуйте позже.");
      } finally {
        setLoading(false);
      }
    }
    bootstrap();
  }, []);

  useEffect(() => {
    if (!selectedWorkspaceId && workspaceOptions.length > 0) {
      setSelectedWorkspaceId(workspaceOptions[0].id);
    }
  }, [selectedWorkspaceId, workspaceOptions]);

  const refreshComments = async (workspaceId) => {
    const response = await listComments({ workspace_id: workspaceId });
    setCommentFeed(response || { count: 0, items: [] });
  };

  const refreshPolicies = async () => {
    const response = await getAccessPolicies();
    setPolicies(response || []);
  };

  const refreshWorkspaces = async () => {
    const response = await listWorkspaces();
    setWorkspaceData(response);
  };

  const refreshInvitations = useCallback(
    async (workspaceId, includeInactive = includeInactiveInvitations) => {
      if (!workspaceId) {
        setInvitations([]);
        return;
      }
      try {
        const response = await listInvitations({
          workspace_id: workspaceId,
          include_inactive: includeInactive,
        });
        setInvitations(response?.items || []);
      } catch (err) {
        console.error("Не удалось загрузить приглашения", err);
      }
    },
    [includeInactiveInvitations]
  );

  useEffect(() => {
    if (activeWorkspaceId) {
      refreshComments(activeWorkspaceId);
      refreshInvitations(activeWorkspaceId, includeInactiveInvitations);
    } else {
      setInvitations([]);
    }
  }, [activeWorkspaceId, includeInactiveInvitations, refreshInvitations]);

  const handleCommentChange = (field) => (event) => {
    setCommentForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleWorkspaceFormChange = (field) => (event) => {
    const value = field === "inheritPermissions" ? event.target.checked : event.target.value;
    setWorkspaceForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleInvitationInputChange = (field) => (event) => {
    const value = field === "expiresInHours" ? Number(event.target.value || 0) : event.target.value;
    setInvitationForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleInvitationDatasetToggle = (datasetId) => (checked) => {
    const isChecked = checked === true;
    setInvitationForm((prev) => {
      const current = new Set(prev.datasetIds);
      if (isChecked) {
        current.add(datasetId);
      } else {
        current.delete(datasetId);
      }
      return { ...prev, datasetIds: Array.from(current) };
    });
  };

  const handleSubmitComment = async (event) => {
    event.preventDefault();
    if (!activeWorkspaceId) {
      setError("Создайте рабочее пространство перед добавлением комментария.");
      return;
    }
    if (!commentForm.author || !commentForm.text) {
      setError("Укажите автора и текст комментария.");
      return;
    }

    setSubmitting(true);
    try {
      const mentions = commentForm.mentions
        ? commentForm.mentions.split(",").map((item) => item.trim()).filter(Boolean)
        : undefined;

      const payload = {
        text: commentForm.text,
        created_by: commentForm.author,
        mentions,
        target: {
          workspace_id: activeWorkspaceId,
          dataset_id: commentForm.datasetId || undefined,
          widget_id: commentForm.widgetId || undefined,
          column: commentForm.column || undefined,
          row:
            commentForm.row !== "" && !Number.isNaN(Number.parseInt(commentForm.row, 10))
              ? Number.parseInt(commentForm.row, 10)
              : undefined,
        },
      };

      await createComment(payload);
      await refreshComments(activeWorkspaceId);
      setCommentForm(emptyCommentForm);
      setSuccessMessage("Комментарий сохранён.");
      setError(null);
    } catch (err) {
      console.error("Не удалось добавить комментарий", err);
      setError("Не удалось добавить комментарий.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateWorkspace = async (event) => {
    event.preventDefault();
    if (!workspaceForm.name || !workspaceForm.createdBy) {
      setError("Укажите название и автора пространства.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: workspaceForm.name,
        created_by: workspaceForm.createdBy,
        description: workspaceForm.description || undefined,
        parent_id: workspaceForm.parentId || undefined,
        inherit_permissions: workspaceForm.inheritPermissions,
      };
      const response = await createWorkspace(payload);
      await Promise.all([refreshWorkspaces(), refreshPolicies()]);
      if (response?.workspace?.id) {
        setSelectedWorkspaceId(response.workspace.id);
        setActiveTab("comments");
      }
      setWorkspaceForm(emptyWorkspaceForm);
      setSuccessMessage("Рабочее пространство создано.");
      setError(null);
    } catch (err) {
      console.error("Не удалось создать пространство", err);
      setError("Не удалось создать рабочее пространство.");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePolicyToggle = async (assignmentId, role) => {
    if (!activePolicy) {
      return;
    }
    const updatedAssignments = activePolicy.assignments.map((assignment) =>
      assignment.id === assignmentId ? { ...assignment, role } : assignment
    );
    try {
      const normalizedAssignments = updatedAssignments.map((assignment) => ({
        id: assignment.id,
        user_id: assignment.user_id,
        role: assignment.role,
        tags: assignment.tags || [],
        folders: assignment.folders || [],
        dataset_ids: assignment.dataset_ids || [],
      }));

      await updateAccessPolicy(activePolicy.workspace_id, {
        assignments: normalizedAssignments,
        actor: "ui-admin",
      });
      await refreshPolicies();
      setSuccessMessage("Права доступа обновлены.");
    } catch (err) {
      console.error("Не удалось обновить политику", err);
      setError("Ошибка обновления прав доступа.");
    }
  };

  const handleCreateInvitationLink = async (event) => {
    event.preventDefault();
    if (!activeWorkspaceId) {
      setError("Выберите рабочее пространство.");
      return;
    }
    if (!invitationForm.createdBy) {
      setError("Укажите инициатора приглашения.");
      return;
    }
    setInvitationSubmitting(true);
    try {
      await createInvitation({
        workspace_id: activeWorkspaceId,
        role: invitationForm.role,
        dataset_ids: invitationForm.datasetIds,
        created_by: invitationForm.createdBy,
        expires_in_hours: invitationForm.expiresInHours || undefined,
      });
      await refreshInvitations(activeWorkspaceId, includeInactiveInvitations);
      setInvitationForm({ ...invitationForm, createdBy: "" });
      setSuccessMessage("Ссылка создана.");
      setError(null);
    } catch (err) {
      console.error("Не удалось создать приглашение", err);
      setError("Не удалось создать приглашение.");
    } finally {
      setInvitationSubmitting(false);
    }
  };

  const handleCopyInvitationLink = async (invitation) => {
    const link = `${invitationLinkBase}/invites/${invitation.token}`;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        setCopiedInvitationId(invitation.id);
        setTimeout(() => setCopiedInvitationId(null), 2000);
      }
    } catch (err) {
      console.error("Не удалось скопировать ссылку", err);
    }
  };

  const handleRevokeInvitationLink = async (invitation) => {
    try {
      await revokeInvitation(invitation.id, "ui-admin");
      await refreshInvitations(activeWorkspaceId, includeInactiveInvitations);
      setSuccessMessage("Приглашение отозвано.");
    } catch (err) {
      console.error("Не удалось отозвать приглашение", err);
      setError("Не удалось отозвать приглашение.");
    }
  };

  const handleToggleInactiveInvitations = () => {
    setIncludeInactiveInvitations((prev) => !prev);
  };

  const datasetsForSelect = useMemo(() => {
    return (datasets || []).map((dataset) => ({
      id: dataset.id || dataset.dataset_id || dataset.name,
      name: dataset.name || dataset.title || dataset.id,
    }));
  }, [datasets]);

  const workspacesSummary = useMemo(() => {
    const total = workspaces.length;
    const inheriting = workspaces.filter((item) => item.workspace.inherit_permissions).length;
    return { total, inheriting };
  }, [workspaces]);

  return (
    <PageContainer
      title="Совместная работа"
      description="Настройте роли Admin/Editor/Viewer, ограничивайте доступ к датасетам и делитесь приглашениями."
    >
      <div className="space-y-6">
        {error && (
          <Card className="border border-destructive/50 bg-destructive/10">
            <CardContent className="py-3 text-sm text-destructive-foreground">{error}</CardContent>
          </Card>
        )}
        {successMessage && (
          <Card className="border border-emerald-500/40 bg-emerald-500/10">
            <CardContent className="py-3 text-sm text-emerald-900">{successMessage}</CardContent>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="comments" className="flex items-center gap-2">
              <MessageSquarePlus className="h-4 w-4" /> Комментарии
            </TabsTrigger>
            <TabsTrigger value="policies" className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Доступ
            </TabsTrigger>
            <TabsTrigger value="workspaces" className="flex items-center gap-2">
              <Users className="h-4 w-4" /> Пространства
            </TabsTrigger>
          </TabsList>

          <TabsContent value="comments" className="mt-4">
            <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
              <Card className="border border-border/60">
                <CardHeader>
                  <CardTitle>Лента комментариев</CardTitle>
                  <CardDescription>Следите за обсуждениями внутри рабочих пространств и датасетов.</CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Загрузка комментариев
                    </div>
                  ) : commentFeed.items?.length ? (
                    <div className="space-y-4">
                      {commentFeed.items.map((comment) => (
                        <Card key={comment.id} className="border border-border/60">
                          <CardContent className="pt-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs uppercase tracking-wide">
                                    {comment.created_by}
                                  </Badge>
                                  <div className="text-xs text-muted-foreground">
                                    {new Date(comment.created_at).toLocaleString()}
                                  </div>
                                </div>
                                <p className="mt-3 text-sm leading-6 text-foreground">{comment.text}</p>
                                <CommentTargetDetails target={comment.target} />
                                {comment.mentions && comment.mentions.length > 0 && (
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {comment.mentions.map((mention) => (
                                      <Badge key={`${comment.id}-${mention}`} variant="secondary" className="text-xs">
                                        @{mention}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                              {comment.resolved && (
                                <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-600">
                                  Закрыт
                                </Badge>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">Комментариев пока нет.</div>
                  )}
                </CardContent>
              </Card>

              <Card className="border border-border/60">
                <CardHeader>
                  <CardTitle>Новый комментарий</CardTitle>
                  <CardDescription>Используйте @упоминания для привлечения коллег к обсуждению.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmitComment} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground/80">Автор</label>
                      <Input
                        placeholder="Имя сотрудника"
                        value={commentForm.author}
                        onChange={handleCommentChange("author")}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground/80">Датасет</label>
                      <select
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                        value={commentForm.datasetId}
                        onChange={handleCommentChange("datasetId")}
                      >
                        <option value="">Без привязки</option>
                        {datasetsForSelect.map((dataset) => (
                          <option key={dataset.id} value={dataset.id}>
                            {dataset.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground/80">Виджет</label>
                        <Input
                          placeholder="chart-1, table-2..."
                          value={commentForm.widgetId}
                          onChange={handleCommentChange("widgetId")}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground/80">Столбец</label>
                        <Input
                          placeholder="revenue"
                          value={commentForm.column}
                          onChange={handleCommentChange("column")}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground/80">Строка</label>
                        <Input
                          placeholder="0"
                          value={commentForm.row}
                          onChange={handleCommentChange("row")}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground/80">@Упоминания</label>
                        <Input
                          placeholder="ivanov, petrov"
                          value={commentForm.mentions}
                          onChange={handleCommentChange("mentions")}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground/80">Комментарий</label>
                      <Textarea
                        placeholder="Опишите наблюдение или вопрос"
                        value={commentForm.text}
                        onChange={handleCommentChange("text")}
                        rows={5}
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={submitting}>
                      {submitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Сохраняем
                        </>
                      ) : (
                        "Добавить комментарий"
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="policies" className="mt-4">
            <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
              <Card className="border border-border/60">
                <CardHeader>
                  <CardTitle>Роли и атрибуты доступа</CardTitle>
                  <CardDescription>
                    Управляйте ролями (Viewer, Editor, Admin) и контекстными ограничениями по тегам, папкам и датасетам.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {activePolicy ? (
                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-3">
                        {Object.entries(activePolicy.roles_summary || {}).map(([role, count]) => (
                          <Badge key={role} variant="secondary" className="text-xs uppercase tracking-wide">
                            {role}: {count}
                          </Badge>
                        ))}
                      </div>
                      <Separator />
                      <AssignmentList policy={activePolicy} />
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      Выберите рабочее пространство для просмотра политик доступа.
                    </div>
                  )}
                </CardContent>
              </Card>
              <div className="space-y-6">
                <Card className="border border-border/60">
                  <CardHeader>
                    <CardTitle>Быстрое обновление ролей</CardTitle>
                    <CardDescription>
                      Нажмите, чтобы переключить роль между Viewer → Editor → Admin для выбранного пользователя.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {activePolicy && activePolicy.assignments && activePolicy.assignments.length > 0 ? (
                      <div className="space-y-3">
                        {activePolicy.assignments.map((assignment) => {
                          const roleCycle = ["viewer", "editor", "admin"];
                          const currentIndex = roleCycle.indexOf(assignment.role);
                          const nextRole = roleCycle[(currentIndex + 1) % roleCycle.length];
                          return (
                            <Button
                              key={assignment.id}
                              type="button"
                              variant="outline"
                              className="w-full justify-between"
                              onClick={() => handlePolicyToggle(assignment.id, nextRole)}
                            >
                              <span className="font-medium">{assignment.user_id}</span>
                              <span className="text-xs uppercase">{assignment.role} → {nextRole}</span>
                            </Button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        Нет прямых назначений в выбранном пространстве.
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border border-border/60">
                  <CardHeader>
                    <CardTitle>Пригласительные ссылки</CardTitle>
                    <CardDescription>
                      Создавайте ссылки на роли и делитесь ими с коллегами. При необходимости ограничьте доступ конкретными датасетами.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <form onSubmit={handleCreateInvitationLink} className="space-y-3">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground/80">Роль</label>
                        <select
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                          value={invitationForm.role}
                          onChange={handleInvitationInputChange("role")}
                        >
                          <option value="viewer">Viewer — чтение</option>
                          <option value="editor">Editor — редактирование</option>
                          <option value="admin">Admin — полный доступ</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground/80">Ограничить датасетами</label>
                        {datasetsForSelect.length > 0 ? (
                          <div className="flex flex-col gap-2 max-h-36 overflow-y-auto rounded-md border border-dashed border-border/80 p-3">
                            {datasetsForSelect.map((dataset) => {
                              const checked = invitationForm.datasetIds.includes(dataset.id);
                              return (
                                <label key={dataset.id} className="flex items-center gap-2 text-sm">
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={handleInvitationDatasetToggle(dataset.id)}
                                  />
                                  <span className="truncate" title={dataset.name}>
                                    {dataset.name}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">Датасеты пока не загружены.</div>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground/80">Инициатор</label>
                          <Input
                            value={invitationForm.createdBy}
                            onChange={handleInvitationInputChange("createdBy")}
                            placeholder="Имя или e-mail"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground/80">Срок действия, ч</label>
                          <Input
                            type="number"
                            min={1}
                            max={2160}
                            value={invitationForm.expiresInHours}
                            onChange={handleInvitationInputChange("expiresInHours")}
                          />
                        </div>
                      </div>
                      <Button type="submit" className="w-full" disabled={invitationSubmitting}>
                        {invitationSubmitting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Создаём ссылку
                          </>
                        ) : (
                          "Создать ссылку"
                        )}
                      </Button>
                    </form>

                    <Separator />

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Активные приглашения: {activeInvitationsCount}</span>
                      <button
                        type="button"
                        onClick={handleToggleInactiveInvitations}
                        className="text-primary hover:underline"
                      >
                        {includeInactiveInvitations ? "Скрыть историю" : "Показать историю"}
                      </button>
                    </div>

                    <ScrollArea className="h-64">
                      <div className="space-y-3">
                        {invitations.length === 0 ? (
                          <div className="text-xs text-muted-foreground">
                            Приглашений пока нет. Создайте первую ссылку.
                          </div>
                        ) : (
                          invitations.map((invitation) => {
                            const isActive = invitation.status === "active";
                            return (
                              <Card key={invitation.id} className="border border-border/60">
                                <CardContent className="py-3 space-y-3">
                                  <div className="flex flex-col gap-1 text-sm">
                                    <span className="font-medium">Роль: {invitation.role}</span>
                                    <span className="text-xs text-muted-foreground">
                                      Статус: {invitation.status}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      Создано: {new Date(invitation.created_at).toLocaleString()} автором {invitation.created_by}
                                    </span>
                                    {invitation.dataset_ids && invitation.dataset_ids.length > 0 && (
                                      <span className="text-xs text-muted-foreground">
                                        Датасеты: {invitation.dataset_ids.join(", ")}
                                      </span>
                                    )}
                                    {invitation.accepted_by && <span>Принял: {invitation.accepted_by}</span>}
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleCopyInvitationLink(invitation)}
                                    >
                                      {copiedInvitationId === invitation.id ? "Скопировано" : "Скопировать"}
                                    </Button>
                                    {isActive && (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleRevokeInvitationLink(invitation)}
                                      >
                                        Отозвать
                                      </Button>
                                    )}
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="workspaces" className="mt-4">
            <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
              <Card className="border border-border/60">
                <CardHeader>
                  <CardTitle>Рабочие пространства и папки</CardTitle>
                  <CardDescription>
                    Создавайте иерархию командных зон с наследованием прав доступа.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {workspaces.length === 0 ? (
                    <div className="text-sm text-muted-foreground">Нет рабочих пространств.</div>
                  ) : (
                    <div className="space-y-3">
                      {workspaces.map((item) => (
                        <Card
                          key={item.workspace.id}
                          className={`border ${
                            item.workspace.id === activeWorkspaceId ? "border-primary" : "border-border/60"
                          }`}
                        >
                          <CardContent className="py-4">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <button
                                  type="button"
                                  onClick={() => setSelectedWorkspaceId(item.workspace.id)}
                                  className="text-left"
                                >
                                  <div className="font-semibold text-sm">{item.workspace.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {item.breadcrumbs.map((crumb) => crumb.name).join(" / ")}
                                  </div>
                                </button>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {(item.workspace.tags || []).map((tag) => (
                                    <Badge key={`${item.workspace.id}-tag-${tag}`} variant="outline" className="text-xs">
                                      #{tag}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                              <div className="text-xs text-muted-foreground text-right">
                                Наследование: {item.workspace.inherit_permissions ? "вкл" : "выкл"}
                                <div>Назначено: {item.effective_assignments.length}</div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card className="border border-border/60">
                  <CardHeader>
                    <CardTitle>Итого</CardTitle>
                    <CardDescription>Сводная информация по пространствам</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <div>Всего пространств: {workspacesSummary.total}</div>
                    <div>Наследуют права: {workspacesSummary.inheriting}</div>
                  </CardContent>
                </Card>

                <Card className="border border-border/60">
                  <CardHeader>
                    <CardTitle>Новое пространство</CardTitle>
                    <CardDescription>Гибкое наследование прав и атрибутов.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleCreateWorkspace} className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground/80">Название</label>
                        <Input
                          placeholder="Например, Маркетинг"
                          value={workspaceForm.name}
                          onChange={handleWorkspaceFormChange("name")}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground/80">Создатель</label>
                        <Input
                          placeholder="Инициатор"
                          value={workspaceForm.createdBy}
                          onChange={handleWorkspaceFormChange("createdBy")}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground/80">Родитель</label>
                        <select
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                          value={workspaceForm.parentId}
                          onChange={handleWorkspaceFormChange("parentId")}
                        >
                          <option value="">Нет</option>
                          {workspaceOptions.map((workspace) => (
                            <option key={workspace.id} value={workspace.id}>
                              {workspace.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground/80">Описание</label>
                        <Textarea
                          placeholder="Цель пространства"
                          value={workspaceForm.description}
                          onChange={handleWorkspaceFormChange("description")}
                          rows={3}
                        />
                      </div>
                      <label className="flex items-center gap-2 text-sm text-foreground/80">
                        <input
                          type="checkbox"
                          checked={workspaceForm.inheritPermissions}
                          onChange={handleWorkspaceFormChange("inheritPermissions")}
                          className="h-4 w-4 rounded border-border"
                        />
                        Наследовать права родителя
                      </label>
                      <Button type="submit" className="w-full" disabled={submitting}>
                        {submitting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Создание
                          </>
                        ) : (
                          "Создать пространство"
                        )}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  );
}
