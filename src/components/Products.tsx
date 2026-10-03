import { useState, useMemo, useEffect, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Package, MapPin, ArrowLeftRight, Layers } from 'lucide-react';
import type { Product, Warehouse, StockTransfer, ProductVariant } from '../types';
import { useDB, useApp } from '../context';
import { getTenantPlanStatus } from '../lib/subscriptionUtils.js';
import { productSchema } from '../lib/validation';
import ProductsCatalog from './products/ProductsCatalog';
import ProductsWarehouses from './products/ProductsWarehouses';
import ProductsTransfers from './products/ProductsTransfers';
import ProductsVariants from './products/ProductsVariants';
import ProductFormModal from './products/ProductFormModal';
import WarehouseFormModal from './products/WarehouseFormModal';
import TransferFormModal from './products/TransferFormModal';
import VariantFormModal from './products/VariantFormModal';
import BarcodeScannerModal from './products/BarcodeScannerModal';
import CategoryManagerModal from './products/CategoryManagerModal';
import { ConfirmDialog } from './shared/ConfirmDialog';
import { uuid } from '../lib/ids';

export default function Products() {
  const { db, handleUpdateDb, handleDeleteRecords, handleSyncFromServer, addNotification } = useDB();
  const { activeTenantId, handleSwitchTenant } = useApp();

  const activeTenant = useMemo(() => db.tenants.find(t => t.id === activeTenantId), [db.tenants, activeTenantId]);

  const planStatus = useMemo(() => {
    if (!activeTenant) return null;
    return getTenantPlanStatus(activeTenant, db);
  }, [activeTenant, db]);

  const [activeSubView, setActiveSubView] = useState<'catalog' | 'warehouses' | 'transfers' | 'variants'>('catalog');

  const effectiveTenantId = useMemo(() => {
    return activeTenantId || activeTenant?.id || db.tenants[0]?.id || 'tenant-demo';
  }, [activeTenantId, activeTenant, db.tenants]);

  const tenantProducts = useMemo(() => {
    // 1. Match direct sur le tenantId effectif
    const direct = db.products.filter(p => p.tenantId === effectiveTenantId);
    // 2. Produits orphelins (créés sans tenantId ou avec tenantId vide)
    const orphans = db.products.filter(p => !p.tenantId || p.tenantId === '');

    // Si on est sur le tenant principal ou s'il n'y a qu'une seule boutique, fusionner les orphelins
    if (effectiveTenantId === (db.tenants[0]?.id || 'tenant-demo') || db.tenants.length <= 1) {
      const combined = [...direct];
      for (const o of orphans) {
        if (!combined.some(p => p.id === o.id)) {
          combined.push(o);
        }
      }
      if (combined.length > 0) return combined;
    }

    if (direct.length > 0) return direct;
    if (orphans.length > 0) return orphans;
    if (db.tenants.length <= 1) return db.products;
    return [];
  }, [db.products, effectiveTenantId, db.tenants]);

  // Auto-réparation des produits sans tenantId pour qu'ils soient toujours visibles
  useEffect(() => {
    const hasOrphans = db.products.some(p => !p.tenantId || p.tenantId === '');
    if (hasOrphans && effectiveTenantId && handleUpdateDb) {
      const healed = db.products.map(p => {
        if (!p.tenantId || p.tenantId === '') {
          return { ...p, tenantId: effectiveTenantId };
        }
        return p;
      });
      handleUpdateDb({ ...db, products: healed });
    }
  }, [db.products, effectiveTenantId, handleUpdateDb]);

  const handleReassignAllProductsToCurrentTenant = () => {
    const targetTenantId = effectiveTenantId;
    if (!targetTenantId) return;
    const updated = db.products.map(p => ({ ...p, tenantId: targetTenantId }));
    handleUpdateDb({ ...db, products: updated });
    addNotification(`${updated.length} produit(s) rattaché(s) à "${activeTenant?.name || 'votre boutique'}"`, 'success');
  };

  const handleLoadDemoProducts = () => {
    const targetTenantId = effectiveTenantId;
    const sampleProducts: Product[] = [
      {
        id: `prod-demo-${uuid()}-1`,
        name: 'Smartphone Pro 5G 128Go',
        sku: 'SKU-PHONE-5G',
        barcode: '3301234567890',
        description: 'Écran OLED 6.7 pouces, 8Go RAM, Triple capteur photo 64MP',
        category: 'Électronique',
        buyPrice: 350,
        sellPrice: 599,
        quantity: 15,
        alertThreshold: 3,
        tenantId: targetTenantId,
        createdAt: new Date().toISOString()
      },
      {
        id: `prod-demo-${uuid()}-2`,
        name: 'Ordinateur Portable Ultra 14"',
        sku: 'SKU-LAPTOP-14',
        barcode: '3309876543210',
        description: 'Processeur Core i7, 16Go RAM, SSD 512Go NVMe, Clavier rétroéclairé',
        category: 'Informatique',
        buyPrice: 650,
        sellPrice: 990,
        quantity: 8,
        alertThreshold: 2,
        tenantId: targetTenantId,
        createdAt: new Date().toISOString()
      },
      {
        id: `prod-demo-${uuid()}-3`,
        name: 'Casque Audio Sans Fil Réduction Bruit',
        sku: 'SKU-AUDIO-ANC',
        barcode: '3305556667778',
        description: 'Autonomie 30h, Bluetooth 5.3, Charge rapide USB-C',
        category: 'Accessoires',
        buyPrice: 45,
        sellPrice: 89,
        quantity: 24,
        alertThreshold: 5,
        tenantId: targetTenantId,
        createdAt: new Date().toISOString()
      },
      {
        id: `prod-demo-${uuid()}-4`,
        name: 'T-Shirt Coton Bio Unisexe',
        sku: 'SKU-TSHIRT-BIO',
        barcode: '3304443332221',
        description: '100% Coton peigné biologique 180g/m², Coupe moderne',
        category: 'Mode',
        buyPrice: 8,
        sellPrice: 22.5,
        quantity: 50,
        alertThreshold: 10,
        tenantId: targetTenantId,
        createdAt: new Date().toISOString()
      }
    ];

    handleUpdateDb({
      ...db,
      products: [...db.products, ...sampleProducts]
    });
    addNotification('4 articles de démonstration ajoutés avec succès !', 'success');
  };

  const tenantWarehouses = useMemo(() => {
    return (db.warehouses || []).filter(w => w.tenantId === activeTenantId);
  }, [db.warehouses, activeTenantId]);

  const tenantTransfers = useMemo(() => {
    return (db.transfers || []).filter(t => t.tenantId === activeTenantId);
  }, [db.transfers, activeTenantId]);

  const tenantVariants = useMemo(() => {
    const productIds = tenantProducts.map(p => p.id);
    return (db.variants || []).filter(v => productIds.includes(v.productId));
  }, [db.variants, tenantProducts]);

  const categories = useMemo(() => {
    const cats = new Set(tenantProducts.map(p => p.category));
    const merged = Array.from(cats);
    if (activeTenant?.customCategories) {
      activeTenant.customCategories.forEach(cat => {
        const trimmedCat = cat.trim();
        if (trimmedCat && !merged.includes(trimmedCat)) {
          merged.push(trimmedCat);
        }
      });
    }
    return ['Tous', ...merged];
  }, [tenantProducts, activeTenant]);

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [deleteProductId, setDeleteProductId] = useState<string | null>(null);

  const handleAddCustomCategory = (catName: string) => {
    const cleaned = catName.trim();
    if (!cleaned) return;
    const currentCats = activeTenant?.customCategories || [];
    if (currentCats.includes(cleaned)) {
      alert("Cette catégorie existe déjà !");
      return;
    }
    const updatedTenant = {
      ...activeTenant!,
      customCategories: [...currentCats, cleaned]
    };
    if (handleUpdateDb) {
      handleUpdateDb({
        ...db,
        tenants: db.tenants.map(t => t.id === activeTenantId ? updatedTenant : t)
      });
    }
    setNewCategoryName('');
  };

  const handleRemoveCustomCategory = (catName: string) => {
    const currentCats = activeTenant?.customCategories || [];
    const updatedTenant = {
      ...activeTenant!,
      customCategories: currentCats.filter(c => c !== catName)
    };
    if (handleUpdateDb) {
      handleUpdateDb({
        ...db,
        tenants: db.tenants.map(t => t.id === activeTenantId ? updatedTenant : t)
      });
    }
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Tous');
  const [filterAlerts, setFilterAlerts] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showBarcodeScannerSim, setShowBarcodeScannerSim] = useState(false);
  const [scannedCode, setScannedCode] = useState('');

  const [isWarehouseModalOpen, setIsWarehouseModalOpen] = useState(false);
  const [warehouseName, setWarehouseName] = useState('');
  const [warehouseLocation, setWarehouseLocation] = useState('');

  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [fromWarehouseId, setFromWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [transferQty, setTransferQty] = useState(1);

  const [isVariantModalOpen, setIsVariantModalOpen] = useState(false);
  const [variantProductId, setVariantProductId] = useState('');
  const [variantName, setVariantName] = useState('');
  const [variantSku, setVariantSku] = useState('');
  const [variantQty, setVariantQty] = useState(5);
  const [priceDelta, setPriceDelta] = useState(0);

  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    barcode: '',
    description: '',
    category: '',
    buyPrice: 0,
    sellPrice: 0,
    quantity: 0,
    alertThreshold: 5,
    image: ''
  });

  const handleOpenCreate = () => {
    if (planStatus?.products.isLimitReached) {
      alert(`Limite de produits de votre forfait atteinte (${planStatus.products.current} / ${planStatus.products.max} max). Veuillez mettre à jour votre abonnement dans l'onglet Paramètres.`);
      return;
    }
    setEditingProduct(null);
    setFormErrors({});
    const randId = Math.floor(Math.random() * 900000) + 100000;
    setFormData({
      name: '',
      sku: `PROD-${randId}`,
      barcode: `333${randId}999`,
      description: '',
      category: tenantProducts[0]?.category || 'Général',
      buyPrice: 0,
      sellPrice: 0,
      quantity: 10,
      alertThreshold: 5,
      image: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (prod: Product) => {
    setEditingProduct(prod);
    setFormErrors({});
    setFormData({
      name: prod.name,
      sku: prod.sku,
      barcode: prod.barcode,
      description: prod.description || '',
      category: prod.category,
      buyPrice: prod.buyPrice,
      sellPrice: prod.sellPrice,
      quantity: prod.quantity,
      alertThreshold: prod.alertThreshold,
      image: prod.image || ''
    });
    setIsModalOpen(true);
  };

  const handleDelete = (productId: string) => {
    setDeleteProductId(productId);
  };

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    const productResult = productSchema.safeParse(formData);
    if (!productResult.success) {
      const errs: Record<string, string> = {};
      for (const issue of productResult.error.issues) {
        const path = issue.path.join('.');
        if (!errs[path]) errs[path] = issue.message;
      }
      setFormErrors(errs);
      return;
    }
    setFormErrors({});

    let updatedProducts: Product[] = [];

    if (editingProduct) {
      updatedProducts = db.products.map(p => {
        if (p.id === editingProduct.id) {
          return {
            ...p,
            name: formData.name,
            sku: formData.sku,
            barcode: formData.barcode,
            description: formData.description,
            category: formData.category,
            buyPrice: Number(formData.buyPrice),
            sellPrice: Number(formData.sellPrice),
            quantity: Number(formData.quantity),
            alertThreshold: Number(formData.alertThreshold),
            image: formData.image
          };
        }
        return p;
      });
    } else {
      const newProduct: Product = {
        id: `p-${uuid()}`,
        name: formData.name,
        sku: formData.sku,
        barcode: formData.barcode,
        description: formData.description,
        category: formData.category,
        buyPrice: Number(formData.buyPrice),
        sellPrice: Number(formData.sellPrice),
        quantity: Number(formData.quantity),
        alertThreshold: Number(formData.alertThreshold),
        image: formData.image,
        tenantId: effectiveTenantId,
        createdAt: new Date().toISOString()
      };
      updatedProducts = [...db.products, newProduct];
    }

    const enteredCategory = formData.category.trim();
    let updatedTenants = db.tenants;
    if (enteredCategory) {
      const currentCats = activeTenant?.customCategories || [];
      if (!currentCats.includes(enteredCategory)) {
        updatedTenants = db.tenants.map(t => {
          if (t.id === effectiveTenantId) {
            return {
              ...t,
              customCategories: [...currentCats, enteredCategory]
            };
          }
          return t;
        });
      }
    }

    if (handleUpdateDb) {
      handleUpdateDb({
        ...db,
        products: updatedProducts,
        tenants: updatedTenants
      });
    } else {
      handleUpdateDb({ ...db, products: updatedProducts });
    }
    setIsModalOpen(false);
  };

  const handleSaveWarehouse = (e: FormEvent) => {
    e.preventDefault();
    if (!warehouseName) return;

    const newWarehouse: Warehouse = {
      id: `w-${uuid()}`,
      name: warehouseName,
      location: warehouseLocation,
      tenantId: effectiveTenantId
    };

    if (handleUpdateDb) {
      handleUpdateDb({
        ...db,
        warehouses: [...(db.warehouses || []), newWarehouse]
      });
    }
    setWarehouseName('');
    setWarehouseLocation('');
    setIsWarehouseModalOpen(false);
  };

  const handleSaveVariant = (e: FormEvent) => {
    e.preventDefault();
    if (!variantProductId || !variantName) return;

    const newVariant: ProductVariant = {
      id: `v-${uuid()}`,
      productId: variantProductId,
      name: variantName,
      sku: variantSku || `V-${Math.floor(Math.random() * 90000)}`,
      quantity: variantQty,
      priceDelta: Number(priceDelta)
    };

    if (handleUpdateDb) {
      handleUpdateDb({
        ...db,
        variants: [...(db.variants || []), newVariant]
      });
    }
    setVariantProductId('');
    setVariantName('');
    setVariantSku('');
    setVariantQty(5);
    setPriceDelta(0);
    setIsVariantModalOpen(false);
  };

  const handleSaveTransfer = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || !fromWarehouseId || !toWarehouseId) return;
    if (fromWarehouseId === toWarehouseId) {
      alert("L'entrepôt de départ et d'arrivée doivent être différents.");
      return;
    }

    const product = tenantProducts.find(p => p.id === selectedProductId);
    if (!product) return;

    if (product.quantity < transferQty) {
      alert(`Quantité de stock insuffisante dans le catalogue (${product.quantity} disponibles).`);
      return;
    }

    const nextProducts = db.products.map(p => {
      if (p.id === selectedProductId) {
        return {
          ...p,
          quantity: Math.max(0, p.quantity - transferQty)
        };
      }
      return p;
    });

    const newTransfer: StockTransfer = {
      id: `tr-${uuid()}`,
      productId: selectedProductId,
      productName: product.name,
      fromWarehouseId,
      toWarehouseId,
      quantity: transferQty,
      date: new Date().toISOString().split('T')[0],
      status: 'termine',
      tenantId: effectiveTenantId
    };

    if (handleUpdateDb) {
      handleUpdateDb({
        ...db,
        products: nextProducts,
        transfers: [...(db.transfers || []), newTransfer]
      });
    } else {
      handleUpdateDb({ ...db, products: nextProducts });
    }

    setIsTransferModalOpen(false);
    alert('Transfert de stock initié et complété avec succès !');
  };

  const handleScanSimulation = (code: string) => {
    setSearchTerm(code);
    setScannedCode(code);
    setShowBarcodeScannerSim(false);
    setTimeout(() => setScannedCode(''), 3000);
  };

  return (
    <div className="space-y-6">

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold font-display text-white">Gestion des Stocks & Logistique</h1>
          <p className="text-xs text-gray-400">Pilotez votre catalogue multi-entrepôts et vos variantes d'articles</p>
        </div>

        <div className="flex flex-wrap gap-1.5 bg-gray-900 p-1 rounded-xl border border-gray-850 self-stretch sm:self-auto">
          <button
            onClick={() => setActiveSubView('catalog')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeSubView === 'catalog' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-850'
            }`}
          >
            <Package className="w-3.5 h-3.5" /> Catalogue
          </button>
          <button
            onClick={() => setActiveSubView('warehouses')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeSubView === 'warehouses' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-850'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" /> Multi-Boutiques ({tenantWarehouses.length})
          </button>
          <button
            onClick={() => setActiveSubView('transfers')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeSubView === 'transfers' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-850'
            }`}
          >
            <ArrowLeftRight className="w-3.5 h-3.5" /> Transferts & Log ({tenantTransfers.length})
          </button>
          <button
            onClick={() => setActiveSubView('variants')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeSubView === 'variants' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-850'
            }`}
          >
            <Layers className="w-3.5 h-3.5" /> Attributs & Variantes ({tenantVariants.length})
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeSubView === 'catalog' && (
          <ProductsCatalog
            key="catalog"
            tenantProducts={tenantProducts}
            allProducts={db.products}
            tenants={db.tenants}
            activeTenantName={activeTenant?.name || 'Organisation'}
            onSwitchTenant={handleSwitchTenant}
            onReassignAllProducts={handleReassignAllProductsToCurrentTenant}
            onForceCloudSync={handleSyncFromServer}
            onLoadDemoProducts={handleLoadDemoProducts}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            filterAlerts={filterAlerts}
            setFilterAlerts={setFilterAlerts}
            categories={categories}
            planName={planStatus?.planName || ''}
            productCount={planStatus?.products.current || 0}
            productLimit={planStatus?.products.max ?? null}
            currency={activeTenant?.currency || 'EUR'}
            onOpenCreate={handleOpenCreate}
            onOpenEdit={handleOpenEdit}
            onDelete={handleDelete}
            onOpenBarcodeScanner={() => setShowBarcodeScannerSim(true)}
            onOpenCategoryManager={() => setIsCategoryModalOpen(true)}
            scannedCode={scannedCode}
          />
        )}
        {activeSubView === 'warehouses' && (
          <ProductsWarehouses
            key="warehouses"
            tenantWarehouses={tenantWarehouses}
            organizationName={activeTenant?.name || ''}
            onCreateWarehouse={() => setIsWarehouseModalOpen(true)}
          />
        )}
        {activeSubView === 'transfers' && (
          <ProductsTransfers
            key="transfers"
            tenantTransfers={tenantTransfers}
            tenantWarehouses={tenantWarehouses}
            tenantProducts={tenantProducts}
            onCreateTransfer={() => {
              if (tenantWarehouses.length < 2) {
                alert("Vous devez configurer au moins 2 entrepôts/boutiques pour effectuer des transferts.");
                return;
              }
              setIsTransferModalOpen(true);
            }}
          />
        )}
        {activeSubView === 'variants' && (
          <ProductsVariants
            key="variants"
            tenantVariants={tenantVariants}
            tenantProducts={tenantProducts}
            onCreateVariant={() => {
              if (tenantProducts.length === 0) {
                alert("Créez d'abord des produits standards dans le catalogue.");
                return;
              }
              setIsVariantModalOpen(true);
            }}
          />
        )}
      </AnimatePresence>

      <ProductFormModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setFormErrors({}); }}
        onSave={handleSave}
        editingProduct={editingProduct}
        formData={formData}
        setFormData={setFormData}
        categories={categories}
        onAddCustomCategory={handleAddCustomCategory}
        currency={activeTenant?.currency || 'EUR'}
        errors={formErrors}
        onClearError={(field) => setFormErrors(prev => { const n = {...prev}; delete n[field]; return n; })}
      />

      <WarehouseFormModal
        isOpen={isWarehouseModalOpen}
        onClose={() => setIsWarehouseModalOpen(false)}
        onSave={handleSaveWarehouse}
        warehouseName={warehouseName}
        setWarehouseName={setWarehouseName}
        warehouseLocation={warehouseLocation}
        setWarehouseLocation={setWarehouseLocation}
      />

      <TransferFormModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        onSave={handleSaveTransfer}
        tenantProducts={tenantProducts}
        tenantWarehouses={tenantWarehouses}
        selectedProductId={selectedProductId}
        setSelectedProductId={setSelectedProductId}
        fromWarehouseId={fromWarehouseId}
        setFromWarehouseId={setFromWarehouseId}
        toWarehouseId={toWarehouseId}
        setToWarehouseId={setToWarehouseId}
        transferQty={transferQty}
        setTransferQty={setTransferQty}
      />

      <VariantFormModal
        isOpen={isVariantModalOpen}
        onClose={() => setIsVariantModalOpen(false)}
        onSave={handleSaveVariant}
        tenantProducts={tenantProducts}
        variantProductId={variantProductId}
        setVariantProductId={setVariantProductId}
        variantName={variantName}
        setVariantName={setVariantName}
        variantSku={variantSku}
        setVariantSku={setVariantSku}
        variantQty={variantQty}
        setVariantQty={setVariantQty}
        priceDelta={priceDelta}
        setPriceDelta={setPriceDelta}
      />

      <BarcodeScannerModal
        isOpen={showBarcodeScannerSim}
        onClose={() => setShowBarcodeScannerSim(false)}
        tenantProducts={tenantProducts}
        onScan={handleScanSimulation}
      />

      <CategoryManagerModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        categories={categories}
        tenantCategories={activeTenant?.customCategories || []}
        onAddCustomCategory={handleAddCustomCategory}
        onRemoveCustomCategory={handleRemoveCustomCategory}
      />

      <ConfirmDialog
        isOpen={deleteProductId !== null}
        title="Confirmation"
        message="Voulez-vous vraiment supprimer ce produit de l'inventaire ?"
        confirmLabel="Supprimer"
        onConfirm={() => {
          if (deleteProductId) void handleDeleteRecords('products', [deleteProductId]);
          setDeleteProductId(null);
        }}
        onCancel={() => setDeleteProductId(null)}
      />
    </div>
  );
}
