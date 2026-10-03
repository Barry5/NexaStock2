import { type FormEvent, type ChangeEvent, type ReactNode } from 'react';
import { compressImageFile } from '../../lib/imageCompression';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle } from 'lucide-react';
import type { Product } from '../../types';

const IMAGE_PRESETS: { label: string; url: string }[] = [];

export { IMAGE_PRESETS };

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (e: FormEvent) => void;
  editingProduct: Product | null;
  formData: { name: string; sku: string; barcode: string; description: string; category: string; buyPrice: number; sellPrice: number; quantity: number; alertThreshold: number; image: string };
  setFormData: (data: any) => void;
  categories: string[];
  onAddCustomCategory: (name: string) => void;
  currency: string;
  errors?: Record<string, string>;
  onClearError?: (field: string) => void;
}

function FormField({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-mono font-bold text-gray-400 uppercase">{label}</label>
      {children}
      {error && (
        <p className="text-[10px] text-red-400 font-mono flex items-center gap-1 mt-0.5">
          <AlertTriangle className="w-3 h-3 flex-shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}

export default function ProductFormModal({
  isOpen,
  onClose,
  onSave,
  editingProduct,
  formData,
  setFormData,
  categories,
  currency,
  errors = {},
  onClearError,
}: ProductFormModalProps) {
  const updateField = (field: string, value: any) => {
    setFormData({ ...formData, [field]: value });
    onClearError?.(field);
  };

  // SYNC-04 : image redimensionnée et compressée (limite de 1 Mio par document Firestore).
  const handleImageFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      updateField('image', await compressImageFile(file));
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const inputClass = (field: string) =>
    `w-full bg-gray-950 border rounded-xl px-4 py-2 text-xs text-white placeholder-gray-600 focus:outline-none transition ${errors[field] ? 'border-red-500' : 'border-gray-800 focus:border-blue-500'}`;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            className="bg-gray-900 border border-gray-850 p-6 rounded-2xl max-w-2xl w-full my-8"
          >
            <div className="flex justify-between items-center pb-4 border-b border-gray-850">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                {editingProduct ? 'Modifier la Fiche Article' : 'Créer un Nouveau Produit'}
              </h3>
              <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none p-1">&times;</button>
            </div>

            <form onSubmit={onSave} className="space-y-4 pt-4" noValidate>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Nom du Produit *" error={errors.name}>
                  <input type="text" required value={formData.name} onChange={(e) => updateField('name', e.target.value)}
                    placeholder="Ex: iPhone 15 Pro Max" className={inputClass('name')} />
                </FormField>

                <div className="grid grid-cols-2 gap-2">
                  <FormField label="UGS (SKU) *" error={errors.sku}>
                    <input type="text" required value={formData.sku} onChange={(e) => updateField('sku', e.target.value)}
                      placeholder="SKU-001" className={inputClass('sku')} />
                  </FormField>

                  <FormField label="Code-barres" error={errors.barcode}>
                    <input type="text" value={formData.barcode} onChange={(e) => updateField('barcode', e.target.value)}
                      placeholder="Optionnel" className={inputClass('barcode')} />
                  </FormField>
                </div>

                <FormField label="Catégorie *" error={errors.category}>
                  <input type="text" list="cat-list" required value={formData.category} onChange={(e) => updateField('category', e.target.value)}
                    placeholder="Ex: Téléphones" className={inputClass('category')} />
                  <datalist id="cat-list">
                    {categories.map(cat => <option key={cat} value={cat} />)}
                  </datalist>
                </FormField>

                <FormField label="Description" error={errors.description}>
                  <input type="text" value={formData.description} onChange={(e) => updateField('description', e.target.value)}
                    placeholder="Brève description" className={inputClass('description')} />
                </FormField>

                <FormField label="Prix d'Achat" error={errors.buyPrice}>
                  <input type="number" step="0.01" min="0" value={formData.buyPrice} onChange={(e) => updateField('buyPrice', Number(e.target.value))}
                    placeholder="0" className={inputClass('buyPrice')} />
                </FormField>

                <FormField label="Prix de Vente" error={errors.sellPrice}>
                  <input type="number" step="0.01" min="0" value={formData.sellPrice} onChange={(e) => updateField('sellPrice', Number(e.target.value))}
                    placeholder="0" className={inputClass('sellPrice')} />
                </FormField>

                <FormField label="Quantité en Stock" error={errors.quantity}>
                  <input type="number" min="0" value={formData.quantity} onChange={(e) => updateField('quantity', Number(e.target.value))}
                    placeholder="0" className={inputClass('quantity')} />
                </FormField>

                <FormField label="Seuil d'Alerte" error={errors.alertThreshold}>
                  <input type="number" min="0" value={formData.alertThreshold} onChange={(e) => updateField('alertThreshold', Number(e.target.value))}
                    placeholder="5" className={inputClass('alertThreshold')} />
                </FormField>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-mono font-bold text-gray-400 uppercase block">Photo du Produit</label>
                {Boolean(formData.image?.trim()) ? (
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-xl overflow-hidden border border-gray-800 bg-gray-950 flex-shrink-0">
                      <img src={formData.image} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                    <button
                      type="button"
                      onClick={() => updateField('image', '')}
                      className="px-2.5 py-1 text-[10px] text-red-400 hover:text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg transition font-mono"
                    >
                      Supprimer l'image
                    </button>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <input type="file" accept="image/*" onChange={handleImageFile}
                    className="text-[10px] text-gray-400 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:bg-gray-800 file:text-gray-300 hover:file:bg-gray-700" />
                  <input type="text" value={formData.image} onChange={(e) => updateField('image', e.target.value)}
                    placeholder="Ou collez une URL d'image..." className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-3 py-1.5 text-[10px] text-white placeholder-gray-600 focus:outline-none focus:border-blue-500" />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-gray-850">
                <button type="button" onClick={onClose}
                  className="bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold px-4 py-2 rounded-xl text-xs transition">Annuler</button>
                <button type="submit"
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-5 py-2 rounded-xl text-xs transition shadow-lg shadow-blue-500/15">
                  {editingProduct ? 'Sauvegarder l\'Article' : 'Créer le Produit'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
