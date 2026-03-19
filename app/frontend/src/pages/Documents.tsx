// ============================================================
// BizPulse KZ — Documents Management Page
// ============================================================

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  FileText, Upload, Calendar, Building2, DollarSign,
  Tag, Eye, Edit2, X, Clock, AlertTriangle,
} from 'lucide-react';
import { getSession, getDocuments, addDocument, updateDocument } from '@/lib/store';
import { extractDocumentText } from '@/lib/parsers';
import { formatKZT } from '@/lib/metrics';
import type { Document } from '@/lib/types';

export default function DocumentsPage() {
  const navigate = useNavigate();
  const session = getSession();
  const companyId = session?.companyId || '';

  const [documents, setDocuments] = useState<Document[]>(() => getDocuments(companyId));
  const [uploading, setUploading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [editMode, setEditMode] = useState(false);

  // Upload form state
  const [title, setTitle] = useState('');
  const [counterparty, setCounterparty] = useState('');
  const [amount, setAmount] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [tags, setTags] = useState('');

  // Edit form state
  const [editTitle, setEditTitle] = useState('');
  const [editCounterparty, setEditCounterparty] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editTags, setEditTags] = useState('');

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'docx'].includes(ext || '')) {
      toast.error('Поддерживаются только PDF и DOCX файлы');
      return;
    }

    setUploading(true);
    try {
      const { text, extracted } = await extractDocumentText(file);

      // Try to extract amount from text using regex
      let extractedAmount: number | undefined;
      if (text) {
        const amountMatch = text.match(/(\d[\d\s]*[\d])\s*(тенге|тг|KZT|₸)/i);
        if (amountMatch) {
          extractedAmount = parseInt(amountMatch[1].replace(/\s/g, ''), 10);
        }
      }

      const doc = addDocument(companyId, {
        title: title || file.name.replace(/\.(pdf|docx)$/i, ''),
        fileName: file.name,
        fileType: ext as 'pdf' | 'docx',
        counterparty: counterparty || undefined,
        amount: amount ? Number(amount) : extractedAmount,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
        extractedText: text ? text.substring(0, 5000) : undefined,
        textExtracted: extracted,
      });

      setDocuments(prev => [doc, ...prev]);
      toast.success(`Документ "${doc.title}" загружен`);

      // Reset form
      setTitle('');
      setCounterparty('');
      setAmount('');
      setStartDate('');
      setEndDate('');
      setTags('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка загрузки документа');
    } finally {
      setUploading(false);
    }
  }, [companyId, title, counterparty, amount, startDate, endDate, tags]);

  const openEditMode = (doc: Document) => {
    setSelectedDoc(doc);
    setEditTitle(doc.title);
    setEditCounterparty(doc.counterparty || '');
    setEditAmount(doc.amount ? String(doc.amount) : '');
    setEditStartDate(doc.startDate || '');
    setEditEndDate(doc.endDate || '');
    setEditTags(doc.tags?.join(', ') || '');
    setEditMode(true);
  };

  const handleSaveEdit = () => {
    if (!selectedDoc) return;
    const updated = updateDocument(selectedDoc.id, {
      title: editTitle,
      counterparty: editCounterparty || undefined,
      amount: editAmount ? Number(editAmount) : undefined,
      startDate: editStartDate || undefined,
      endDate: editEndDate || undefined,
      tags: editTags ? editTags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
    });
    if (updated) {
      setDocuments(prev => prev.map(d => d.id === updated.id ? updated : d));
      toast.success('Документ обновлён');
    }
    setEditMode(false);
    setSelectedDoc(null);
  };

  const isDeadlineSoon = (endDate?: string) => {
    if (!endDate) return false;
    const end = new Date(endDate);
    const now = new Date();
    const diff = (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 7;
  };

  const isExpired = (endDate?: string) => {
    if (!endDate) return false;
    return new Date(endDate) < new Date();
  };

  if (!session) {
    navigate('/');
    return null;
  }

  return (
    <AppLayout>
      <div className="rct-page p-4 lg:p-6 space-y-8 max-w-[1400px] mx-auto">
        {/* Header */}
        <div>
          <h1 className="rct-page-title">Документы</h1>
          <p className="rct-body-micro mt-1">
            Договора и файлы компании — PDF, DOCX
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Upload Form */}
          <Card className="rct-card">
            <CardHeader className="rct-card-padding pb-3">
              <CardTitle className="rct-section-title flex items-center gap-2">
                <Upload className="h-5 w-5 text-[#1E3A5F]" />
                Загрузить документ
              </CardTitle>
            </CardHeader>
            <CardContent className="rct-card-padding pt-0 space-y-4">
              <div className="space-y-2">
                <Label>Название</Label>
                <Input
                  placeholder="Договор аренды"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Контрагент</Label>
                <Input
                  placeholder='ТОО "Компания"'
                  value={counterparty}
                  onChange={e => setCounterparty(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Сумма (₸)</Label>
                  <Input
                    type="number"
                    placeholder="500000"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Теги</Label>
                  <Input
                    placeholder="аренда, офис"
                    value={tags}
                    onChange={e => setTags(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Начало</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Дедлайн</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                  />
                </div>
              </div>
              <label
                htmlFor="doc-input"
                className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary hover:bg-primary/5 transition-all"
              >
                <FileText className="h-8 w-8 text-muted-foreground/60 mb-1" />
                <p className="text-xs text-muted-foreground">PDF или DOCX</p>
                <input
                  id="doc-input"
                  type="file"
                  accept=".pdf,.docx"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
              </label>
              {uploading && (
                <p className="text-xs text-muted-foreground text-center">Обработка документа...</p>
              )}
            </CardContent>
          </Card>

          {/* Documents List */}
          <div className="lg:col-span-2">
            {documents.length === 0 ? (
              <Card className="rct-card">
                <CardContent className="py-16 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
                  <p className="text-sm font-medium text-muted-foreground">Нет документов</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Загрузите PDF или DOCX файл</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {documents
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                  .map(doc => (
                    <Card
                      key={doc.id}
                      className={`rct-card transition-shadow hover:shadow-md cursor-pointer ${
                        isExpired(doc.endDate) ? 'border-red-200 bg-red-50/30' :
                        isDeadlineSoon(doc.endDate) ? 'border-amber-200 bg-amber-50/30' :
                        ''
                      }`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div className={`p-2 rounded-lg shrink-0 ${
                              doc.fileType === 'pdf' ? 'bg-red-100' : 'bg-blue-100'
                            }`}>
                              <FileText className={`h-5 w-5 ${
                                doc.fileType === 'pdf' ? 'text-red-600' : 'text-blue-600'
                              }`} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="text-sm font-semibold text-foreground truncate">
                                  {doc.title}
                                </h4>
                                <Badge variant="outline" className="text-xs shrink-0">
                                  {doc.fileType.toUpperCase()}
                                </Badge>
                                {doc.textExtracted && (
                                  <Badge variant="secondary" className="text-xs shrink-0">
                                    Текст извлечён
                                  </Badge>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                {doc.counterparty && (
                                  <span className="flex items-center gap-1">
                                    <Building2 className="h-3 w-3" />
                                    {doc.counterparty}
                                  </span>
                                )}
                                {doc.amount && (
                                  <span className="flex items-center gap-1">
                                    <DollarSign className="h-3 w-3" />
                                    {formatKZT(doc.amount)}
                                  </span>
                                )}
                                {doc.endDate && (
                                  <span className={`flex items-center gap-1 ${
                                    isExpired(doc.endDate) ? 'text-red-600 font-medium' :
                                    isDeadlineSoon(doc.endDate) ? 'text-yellow-600 dark:text-yellow-400 font-medium' :
                                    ''
                                  }`}>
                                    {isExpired(doc.endDate) ? (
                                      <AlertTriangle className="h-3 w-3" />
                                    ) : (
                                      <Clock className="h-3 w-3" />
                                    )}
                                    {isExpired(doc.endDate) ? 'Истёк: ' : 'До: '}
                                    {new Date(doc.endDate).toLocaleDateString('ru-KZ')}
                                  </span>
                                )}
                              </div>

                              {doc.tags && doc.tags.length > 0 && (
                                <div className="flex gap-1 mt-2">
                                  {doc.tags.map(tag => (
                                    <Badge key={tag} variant="outline" className="text-xs">
                                      <Tag className="h-2.5 w-2.5 mr-1" />
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex gap-1 shrink-0">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => setSelectedDoc(doc)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-lg">
                                <DialogHeader>
                                  <DialogTitle>{doc.title}</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-3 text-sm">
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <p className="text-xs text-muted-foreground">Файл</p>
                                      <p className="font-medium">{doc.fileName}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground">Тип</p>
                                      <p className="font-medium">{doc.fileType.toUpperCase()}</p>
                                    </div>
                                    {doc.counterparty && (
                                      <div>
                                        <p className="text-xs text-muted-foreground">Контрагент</p>
                                        <p className="font-medium">{doc.counterparty}</p>
                                      </div>
                                    )}
                                    {doc.amount && (
                                      <div>
                                        <p className="text-xs text-muted-foreground">Сумма</p>
                                        <p className="font-medium">{formatKZT(doc.amount)}</p>
                                      </div>
                                    )}
                                    {doc.startDate && (
                                      <div>
                                        <p className="text-xs text-muted-foreground">Начало</p>
                                        <p className="font-medium">{new Date(doc.startDate).toLocaleDateString('ru-KZ')}</p>
                                      </div>
                                    )}
                                    {doc.endDate && (
                                      <div>
                                        <p className="text-xs text-muted-foreground">Дедлайн</p>
                                        <p className="font-medium">{new Date(doc.endDate).toLocaleDateString('ru-KZ')}</p>
                                      </div>
                                    )}
                                  </div>
                                  {doc.extractedText && (
                                    <div>
                                      <p className="text-xs text-muted-foreground mb-1">Извлечённый текст</p>
                                      <div className="bg-muted rounded-lg p-3 max-h-[200px] overflow-y-auto text-xs text-muted-foreground whitespace-pre-wrap">
                                        {doc.extractedText.substring(0, 2000)}
                                        {doc.extractedText.length > 2000 && '...'}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </DialogContent>
                            </Dialog>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEditMode(doc)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Edit Dialog */}
        <Dialog open={editMode} onOpenChange={setEditMode}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Редактировать документ</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Название</Label>
                <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Контрагент</Label>
                <Input value={editCounterparty} onChange={e => setEditCounterparty(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Сумма (₸)</Label>
                  <Input type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Теги</Label>
                  <Input value={editTags} onChange={e => setEditTags(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Начало</Label>
                  <Input type="date" value={editStartDate} onChange={e => setEditStartDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Дедлайн</Label>
                  <Input type="date" value={editEndDate} onChange={e => setEditEndDate(e.target.value)} />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setEditMode(false)}>Отмена</Button>
                <Button onClick={handleSaveEdit} className="bg-primary hover:bg-primary/90">
                  Сохранить
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}