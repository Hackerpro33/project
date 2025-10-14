import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import PageContainer from '@/components/layout/PageContainer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Loader2, ShieldCheck } from 'lucide-react';
import { acceptInvitation, getInvitation } from '@/api/collaboration';

export default function InvitationAccept() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [userId, setUserId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadInvitation() {
      if (!token) {
        setError('Приглашение не найдено.');
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const response = await getInvitation(token);
        setInvitation(response);
        setError(null);
      } catch (err) {
        console.error('Не удалось загрузить приглашение', err);
        setError('Приглашение недействительно или было отозвано.');
      } finally {
        setLoading(false);
      }
    }
    loadInvitation();
  }, [token]);

  const isActive = useMemo(() => invitation?.status === 'active', [invitation]);
  const isExpired = useMemo(() => invitation?.status === 'expired', [invitation]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!userId.trim()) {
      setError('Укажите идентификатор пользователя.');
      return;
    }
    if (!token || !isActive) {
      setError('Приглашение недоступно для активации.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await acceptInvitation(token, { user_id: userId.trim() });
      setSuccess(`Права успешно выданы для ${response.user_id}.`);
      setError(null);
      setInvitation((prev) =>
        prev
          ? {
              ...prev,
              status: 'accepted',
              accepted_by: response.user_id,
              accepted_at: response.updated_at || new Date().toISOString(),
            }
          : prev
      );
    } catch (err) {
      console.error('Не удалось принять приглашение', err);
      setError('Не удалось активировать приглашение. Возможно, оно уже использовано.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderStatus = () => {
    if (loading) {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Проверяем приглашение
        </div>
      );
    }
    if (!invitation) {
      return <div className="text-sm text-destructive">Приглашение не найдено.</div>;
    }
    if (!isActive) {
      const description = isExpired
        ? 'Срок действия ссылки истёк. Обратитесь к администратору за новой ссылкой.'
        : 'Ссылка уже была использована или отозвана.';
      return <div className="text-sm text-muted-foreground">{description}</div>;
    }
    return <div className="text-sm text-emerald-600">Приглашение активно и готово к активации.</div>;
  };

  return (
    <PageContainer>
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Активация приглашения</h1>
            <p className="text-muted-foreground">
              Введите свой идентификатор, чтобы получить доступ в соответствии с приглашением.
            </p>
          </div>
        </div>

        {error && (
          <Card className="border border-destructive/40 bg-destructive/10">
            <CardContent className="py-3 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {success && (
          <Card className="border border-emerald-200 bg-emerald-50">
            <CardContent className="py-3 text-sm text-emerald-700">{success}</CardContent>
          </Card>
        )}

        <Card className="border border-border/60">
          <CardHeader>
            <CardTitle>Детали приглашения</CardTitle>
            <CardDescription>
              Проверьте область доступа и подтвердите, что вы готовы принять приглашение.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Загружаем детали
              </div>
            ) : invitation ? (
              <>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Роль</div>
                    <div className="text-base font-semibold uppercase">{invitation.role}</div>
                  </div>
                  <Badge variant={isActive ? 'secondary' : 'outline'} className="uppercase text-xs">
                    {invitation.status}
                  </Badge>
                </div>
                <Separator />
                <dl className="grid gap-3 text-sm text-muted-foreground">
                  <div>
                    <dt className="font-medium text-foreground">Рабочее пространство</dt>
                    <dd>{invitation.workspace_id}</dd>
                  </div>
                  {invitation.dataset_ids && invitation.dataset_ids.length > 0 && (
                    <div>
                      <dt className="font-medium text-foreground">Доступные датасеты</dt>
                      <dd>{invitation.dataset_ids.join(', ')}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="font-medium text-foreground">Создал</dt>
                    <dd>{invitation.created_by}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-foreground">Дата создания</dt>
                    <dd>{new Date(invitation.created_at).toLocaleString()}</dd>
                  </div>
                  {invitation.expires_at && (
                    <div>
                      <dt className="font-medium text-foreground">Действительно до</dt>
                      <dd>{new Date(invitation.expires_at).toLocaleString()}</dd>
                    </div>
                  )}
                  {invitation.accepted_by && (
                    <div>
                      <dt className="font-medium text-foreground">Уже использовано</dt>
                      <dd>{invitation.accepted_by}</dd>
                    </div>
                  )}
                </dl>
                <Separator />
                {renderStatus()}
              </>
            ) : (
              <div className="text-sm text-muted-foreground">Приглашение не найдено.</div>
            )}
          </CardContent>
        </Card>

        <Card className="border border-border/60">
          <CardHeader>
            <CardTitle>Принять приглашение</CardTitle>
            <CardDescription>
              Укажите идентификатор пользователя (например, корпоративный логин), чтобы получить роль из приглашения.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/80">Ваш идентификатор</label>
                <Input
                  value={userId}
                  onChange={(event) => setUserId(event.target.value)}
                  placeholder="ivanov-i"
                  disabled={!isActive || submitting}
                />
              </div>
              <Button type="submit" disabled={!isActive || submitting} className="w-full">
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Подтверждаем доступ
                  </>
                ) : (
                  'Принять приглашение'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
