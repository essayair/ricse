'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, FolderTree, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface Category {
  id: string;
  name: string;
  parentId: string | null;
  sort: number;
  _count: { materials: number };
  children: Category[];
}

type EditorState =
  | { mode: 'create-root'; item?: undefined; parent?: undefined }
  | { mode: 'create-child'; item?: undefined; parent: Category }
  | { mode: 'edit'; item: Category; parent?: Category };

export default function MaterialCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [name, setName] = useState('');
  const [sort, setSort] = useState('0');

  const load = async () => {
    setLoading(true);
    try {
      setCategories(await api.get<Category[]>('/master-data/material-categories'));
    } catch (error) {
      alert(error instanceof Error ? error.message : '物料分类加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openEditor = (next: EditorState) => {
    setEditor(next);
    setName(next.mode === 'edit' ? next.item.name : '');
    setSort(String(next.mode === 'edit' ? next.item.sort : 0));
  };

  const closeEditor = () => {
    if (!saving) setEditor(null);
  };

  const save = async () => {
    if (!editor) return;
    const normalizedName = name.trim();
    if (!normalizedName) {
      alert('请输入分类名称');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: normalizedName,
        sort: Number.isFinite(Number(sort)) ? Number(sort) : 0,
      };
      if (editor.mode === 'edit') {
        await api.patch(`/master-data/material-categories/${editor.item.id}`, payload);
      } else {
        await api.post('/master-data/material-categories', {
          ...payload,
          parentId: editor.mode === 'create-child' ? editor.parent.id : undefined,
        });
      }
      setEditor(null);
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (category: Category) => {
    if (!window.confirm(`确定删除分类“${category.name}”吗？删除后不可恢复。`)) return;
    try {
      await api.delete(`/master-data/material-categories/${category.id}`);
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : '删除失败');
    }
  };

  const totalChildren = categories.reduce((sum, item) => sum + item.children.length, 0);
  const totalMaterials = categories.reduce(
    (sum, item) => sum + item._count.materials + item.children.reduce((childSum, child) => childSum + child._count.materials, 0),
    0,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">物料分类管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">维护一级大类和二级分类，物料档案从这里引用分类</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/master-data?tab=materials">
            <Button variant="outline"><ChevronLeft className="mr-1 h-4 w-4" />返回物料档案</Button>
          </Link>
          <Button onClick={() => openEditor({ mode: 'create-root' })}>
            <Plus className="mr-1 h-4 w-4" />新建一级分类
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="一级分类" value={categories.length} />
        <SummaryCard label="二级分类" value={totalChildren} />
        <SummaryCard label="关联物料" value={totalMaterials} />
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-muted-foreground">加载中...</div>
        ) : categories.length === 0 ? (
          <div className="p-12 text-center">
            <FolderTree className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <div className="font-medium">暂无物料分类</div>
            <p className="mt-1 text-sm text-muted-foreground">请先新建一级分类，再按需要添加二级分类</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="p-3">分类名称</th>
                  <th className="p-3">层级</th>
                  <th className="p-3">排序</th>
                  <th className="p-3">下级分类</th>
                  <th className="p-3">关联物料</th>
                  <th className="p-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <CategoryRows
                    key={category.id}
                    category={category}
                    onCreateChild={() => openEditor({ mode: 'create-child', parent: category })}
                    onEdit={(item, parent) => openEditor({ mode: 'edit', item, parent })}
                    onDelete={(item) => void remove(item)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={Boolean(editor)} onOpenChange={(open) => !open && closeEditor()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editorTitle(editor)}</DialogTitle>
            <DialogDescription>
              {editor?.mode === 'create-child'
                ? `上级分类：${editor.parent.name}`
                : editor?.mode === 'edit' && editor.item.parentId
                  ? `所属一级分类：${editor.parent?.name || '—'}`
                  : '一级分类可继续添加二级分类，系统最多支持两级。'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">分类名称 <span className="text-destructive">*</span></span>
              <Input
                autoFocus
                maxLength={50}
                placeholder="请输入分类名称"
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && void save()}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">排序号</span>
              <Input
                type="number"
                min="0"
                step="1"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              />
              <span className="block text-xs text-muted-foreground">数值越小显示越靠前，同一层级内生效</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeEditor} disabled={saving}>取消</Button>
            <Button onClick={() => void save()} disabled={saving}>{saving ? '保存中...' : '保存'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </Card>
  );
}

function CategoryRows({
  category,
  onCreateChild,
  onEdit,
  onDelete,
}: {
  category: Category;
  onCreateChild: () => void;
  onEdit: (item: Category, parent?: Category) => void;
  onDelete: (item: Category) => void;
}) {
  return (
    <>
      <tr className="border-b bg-muted/10">
        <td className="p-3 font-medium">
          <span className="inline-flex items-center gap-2"><FolderTree className="h-4 w-4 text-primary" />{category.name}</span>
        </td>
        <td className="p-3">一级分类</td>
        <td className="p-3 font-mono">{category.sort}</td>
        <td className="p-3">{category.children.length}</td>
        <td className="p-3">{category._count.materials}</td>
        <td className="p-3">
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={onCreateChild}><Plus className="mr-1 h-3.5 w-3.5" />添加下级</Button>
            <Button variant="ghost" size="sm" onClick={() => onEdit(category)}><Pencil className="mr-1 h-3.5 w-3.5" />编辑</Button>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => onDelete(category)}>
              <Trash2 className="mr-1 h-3.5 w-3.5" />删除
            </Button>
          </div>
        </td>
      </tr>
      {category.children.map((child) => (
        <tr key={child.id} className="border-b">
          <td className="p-3 pl-11">
            <span className="relative before:absolute before:-left-5 before:top-1/2 before:h-px before:w-3 before:bg-border">{child.name}</span>
          </td>
          <td className="p-3 text-muted-foreground">二级分类</td>
          <td className="p-3 font-mono">{child.sort}</td>
          <td className="p-3 text-muted-foreground">—</td>
          <td className="p-3">{child._count.materials}</td>
          <td className="p-3">
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => onEdit(child, category)}><Pencil className="mr-1 h-3.5 w-3.5" />编辑</Button>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => onDelete(child)}>
                <Trash2 className="mr-1 h-3.5 w-3.5" />删除
              </Button>
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}

function editorTitle(editor: EditorState | null) {
  if (!editor) return '';
  if (editor.mode === 'create-root') return '新建一级分类';
  if (editor.mode === 'create-child') return '新建二级分类';
  return `编辑${editor.item.parentId ? '二级' : '一级'}分类`;
}
