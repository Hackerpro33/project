import React, { useState, useEffect } from 'react';
// import { User } from "@/api/entities";   // УДАЛЁН! Не нужен.
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  User as UserIcon, 
  UserPlus, 
  Settings, 
  Shield, 
  Mail,
  Calendar,
  Search,
  MoreHorizontal
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadCurrentUser();
    loadUsers();
  }, []);

  const loadCurrentUser = async () => {
    try {
      // Временно используем тестового пользователя
      setCurrentUser({
        full_name: "Demo User",
        email: "demo@localhost",
        role: "admin"
      });
    } catch (error) {
      console.error('Ошибка загрузки текущего пользователя:', error);
    }
  };

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      // В будущем замени на API-запрос к своему backend
      const mockUsers = [
        {
          id: '1',
          full_name: 'Администратор',
          email: 'admin@example.com',
          role: 'admin',
          created_date: '2024-01-01T00:00:00Z',
          last_login: '2024-01-15T10:30:00Z',
          status: 'active'
        },
        {
          id: '2',
          full_name: 'Аналитик Данных',
          email: 'analyst@example.com',
          role: 'user',
          created_date: '2024-01-05T00:00:00Z',
          last_login: '2024-01-14T16:45:00Z',
          status: 'active'
        },
        {
          id: '3',
          full_name: 'Гостевой Пользователь',
          email: 'guest@example.com',
          role: 'user',
          created_date: '2024-01-10T00:00:00Z',
          last_login: '2024-01-12T09:15:00Z',
          status: 'inactive'
        }
      ];
      setUsers(mockUsers);
    } catch (error) {
      console.error('Ошибка загрузки пользователей:', error);
    }
    setIsLoading(false);
  };

  const filteredUsers = users.filter(user =>
    user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getRoleBadge = (role) => {
    if (role === 'admin') {
      return <Badge className="bg-red-100 text-red-700">Администратор</Badge>;
    }
    return <Badge className="bg-blue-100 text-blue-700">Пользователь</Badge>;
  };

  const getStatusBadge = (status) => {
    if (status === 'active') {
      return <Badge className="bg-green-100 text-green-700">Активен</Badge>;
    }
    return <Badge variant="outline">Неактивен</Badge>;
  };

  const getRoleIcon = (role) => {
    if (role === 'admin') {
      return <Shield className="w-4 h-4 text-red-600" />;
    }
    return <UserIcon className="w-4 h-4 text-blue-600" />;
  };

  return (
    <div className="space-y-6">
      {/* Current User Info */}
      {currentUser && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserIcon className="w-5 h-5 text-blue-500" />
              Информация о текущем пользователе
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 p-4 bg-blue-50 rounded-lg">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-cyan-600 rounded-full flex items-center justify-center">
                <UserIcon className="w-8 h-8 text-white" />
              </div>
              <div className="flex-1">
                <div className="font-bold text-lg">{currentUser.full_name}</div>
                <div className="text-slate-600 flex items-center gap-1">
                  <Mail className="w-4 h-4" />
                  {currentUser.email}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {getRoleIcon(currentUser.role)}
                  {getRoleBadge(currentUser.role)}
                </div>
              </div>
              <Button variant="outline" className="gap-2">
                <Settings className="w-4 h-4" />
                Редактировать профиль
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* User Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6 text-center">
            <div className="w-12 h-12 mx-auto mb-4 bg-gradient-to-r from-blue-500 to-cyan-600 rounded-xl flex items-center justify-center">
              <UserIcon className="w-6 h-6 text-white" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{users.length}</div>
            <div className="text-sm text-slate-600">Всего пользователей</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6 text-center">
            <div className="w-12 h-12 mx-auto mb-4 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div className="text-2xl font-bold text-slate-900">
              {users.filter(u => u.status === 'active').length}
            </div>
            <div className="text-sm text-slate-600">Активных пользователей</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 text-center">
            <div className="w-12 h-12 mx-auto mb-4 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center">
              <UserPlus className="w-6 h-6 text-white" />
            </div>
            <div className="text-2xl font-bold text-slate-900">
              {users.filter(u => u.role === 'admin').length}
            </div>
            <div className="text-sm text-slate-600">Администраторов</div>
          </CardContent>
        </Card>
      </div>

      {/* User Management */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <UserIcon className="w-5 h-5 text-emerald-500" />
              Управление пользователями
            </CardTitle>
            <Button className="gap-2">
              <UserPlus className="w-4 h-4" />
              Пригласить пользователя
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                placeholder="Поиск пользователей..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div className="space-y-3">
            {filteredUsers.map(user => (
              <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-slate-400 to-slate-600 rounded-full flex items-center justify-center">
                    <UserIcon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {user.full_name}
                      {getRoleIcon(user.role)}
                    </div>
                    <div className="text-sm text-slate-600 flex items-center gap-1">
                      <Mail className="w-3 h-3" />
                      {user.email}
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                      <Calendar className="w-3 h-3" />
                      Последний вход: {new Date(user.last_login).toLocaleDateString('ru-RU')}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  {getRoleBadge(user.role)}
                  {getStatusBadge(user.status)}
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>
                        <Settings className="w-4 h-4 mr-2" />
                        Редактировать
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Shield className="w-4 h-4 mr-2" />
                        Изменить роль
                      </DropdownMenuItem>
                      {user.status === 'active' ? (
                        <DropdownMenuItem className="text-red-600">
                          Деактивировать
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem className="text-green-600">
                          Активировать
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>

          {filteredUsers.length === 0 && (
            <div className="text-center py-12">
              <UserIcon className="w-16 h-16 mx-auto text-slate-400 mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 mb-2">Пользователи не найдены</h3>
              <p className="text-slate-500">Попробуйте изменить параметры поиска</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

