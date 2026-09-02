import { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useDB } from '../context/DBContext';
import { DEFAULT_MODULE_DEFINITIONS, getDefaultModulesForPlan } from '../constants';
import type { ModuleDefinition } from '../types';

export interface ModuleState {
  availableModules: string[];
  allDefinitions: ModuleDefinition[];
  isModuleAvailable: (key: string) => boolean;
  loading: boolean;
  error: string | null;
}

export function useAvailableModules(): ModuleState {
  const { db } = useDB();
  const { activeUser, activeTenant } = useApp();

  const allDefinitions: ModuleDefinition[] = useMemo(() => {
    if (db.moduleDefinitions && db.moduleDefinitions.length > 0) {
      return db.moduleDefinitions;
    }
    return DEFAULT_MODULE_DEFINITIONS as ModuleDefinition[];
  }, [db.moduleDefinitions]);

  const availableModules: string[] = useMemo(() => {
    // Superadmin has absolute access to every module
    if (activeUser?.role === 'superadmin') {
      return allDefinitions.map(d => d.key);
    }

    // Default core modules for when no tenant is loaded
    const coreKeys = allDefinitions.filter(d => d.is_core).map(d => d.key);
    if (!activeTenant) {
      return coreKeys.length > 0 ? coreKeys : ['dashboard', 'settings'];
    }

    // Determine current plan identifier for the tenant
    const tenantPlan = (activeTenant.plan || 'Standard').toString().trim();
    const tenantPlanId = (activeTenant.subscriptionPlanId || '').toString().trim();

    // Find the matching plan object in pricingPlans
    const pricingPlans = db.pricingPlans || [];
    const matchedPlan = pricingPlans.find(
      p => (tenantPlanId && p.id === tenantPlanId) ||
           p.name.toLowerCase() === tenantPlan.toLowerCase() ||
           p.id.toLowerCase() === tenantPlan.toLowerCase()
    );

    const effectivePlanId = matchedPlan ? matchedPlan.id : (tenantPlanId || 'plan-standard');
    const effectivePlanName = matchedPlan ? matchedPlan.name : tenantPlan;

    // Check if planModules exists in database for this plan
    const planModulesList = db.planModules || [];
    const planSpecificModules = planModulesList.filter(
      pm => pm.planId === effectivePlanId ||
            (matchedPlan && pm.planId === matchedPlan.name) ||
            pm.planId.toLowerCase() === effectivePlanName.toLowerCase()
    );

    let activeKeys: string[] = [];

    if (planSpecificModules.length > 0) {
      // Use configured modules for this plan
      activeKeys = planSpecificModules
        .filter(pm => pm.enabled !== false)
        .map(pm => pm.moduleKey);
    } else {
      // Use intelligent defaults based on plan name/id
      activeKeys = getDefaultModulesForPlan(effectivePlanId || effectivePlanName);
    }

    // Apply tenant-level specific overrides if defined
    const tenantOverrides = (db.tenantModules || []).filter(tm => tm.tenantId === activeTenant.id);
    for (const override of tenantOverrides) {
      if (override.enabled) {
        if (!activeKeys.includes(override.moduleKey)) {
          activeKeys.push(override.moduleKey);
        }
      } else {
        activeKeys = activeKeys.filter(k => k !== override.moduleKey);
      }
    }

    // Always ensure core modules are included
    for (const coreKey of coreKeys) {
      if (!activeKeys.includes(coreKey)) {
        activeKeys.push(coreKey);
      }
    }

    return activeKeys;
  }, [activeUser, activeTenant, allDefinitions, db.pricingPlans, db.planModules, db.tenantModules]);

  const isModuleAvailable = useMemo(() => {
    return (key: string) => {
      if (activeUser?.role === 'superadmin') return true;
      return availableModules.includes(key);
    };
  }, [activeUser, availableModules]);

  return {
    availableModules,
    allDefinitions,
    isModuleAvailable,
    loading: false,
    error: null,
  };
}

export function useModuleAccess(moduleKey: string): boolean {
  const { isModuleAvailable } = useAvailableModules();
  return isModuleAvailable(moduleKey);
}

export function resetModuleCache() {
  // Retained for API compatibility
}

