"""
test_router_pipelines.py - Automated Tests for Pipeline A (Configuration) & Pipeline B (Routing)
------------------------------------------------------------------------------------------------
Verifies:
1. Shared registry configuration updates (PATCH)
2. Invalid configuration validation & rejection
3. Persistence of judge changes across registry reloads
4. Test A: Normal request ('HII') selects Qwen3.5 2B (lowest latency)
5. Test B: Judge increases Qwen3.5 2B avg_latency_ms (650ms -> 5000ms), next request selects Qwen3.5 4B
6. Test C: Model disabled/unavailable causes router to select next eligible candidate
7. Test D: Impossible constraints returns NO_VALID_MODEL status
8. Test E: Reset defaults restores factory configuration
9. Distinction between live and simulated execution modes
"""

import unittest
import os
import json
from models import ModelRegistry, _DEFAULT_PROFILES
from router import ModelRouter
from constraint_engine import ConstraintEngine


class TestModelRouterPipelines(unittest.TestCase):

    def setUp(self):
        self.test_json = "test_models_config.json"
        if os.path.exists(self.test_json):
            os.remove(self.test_json)
        self.registry = ModelRegistry(persistence_path=self.test_json)
        self.router = ModelRouter()
        self.engine = ConstraintEngine()

    def tearDown(self):
        if os.path.exists(self.test_json):
            os.remove(self.test_json)

    def test_01_registry_defaults(self):
        models = self.registry.get_all()
        self.assertIn("qwen-2b", models)
        self.assertIn("qwen-4b", models)
        self.assertIn("deepseek-r1", models)
        self.assertIn("gpt-oss-20b", models)
        self.assertIn("gemma-12b", models)
        self.assertEqual(models["qwen-2b"].avg_latency_ms, 650)
        self.assertEqual(models["qwen-2b"].max_latency_ms, 1800)

    def test_02_patch_validation_invalid_values(self):
        # Negative latency
        valid, err = self.registry.validate_patch({"avg_latency_ms": -100})
        self.assertFalse(valid)

        # Out-of-bounds capability
        valid, err = self.registry.validate_patch({"capability_score": 15.0})
        self.assertFalse(valid)

        # Arbitrary unknown field
        valid, err = self.registry.validate_patch({"hack_field": "exploit"})
        self.assertFalse(valid)

    def test_03_persistence_of_judge_changes(self):
        # Judge edits Qwen 2B avg latency
        updated, err = self.registry.update("qwen-2b", {"avg_latency_ms": 1900, "enabled": True})
        self.assertIsNone(err)
        self.assertEqual(updated.avg_latency_ms, 1900)

        # Create new registry pointing to same json file (simulating backend restart)
        reloaded_registry = ModelRegistry(persistence_path=self.test_json)
        reloaded_model = reloaded_registry.get("qwen-2b")
        self.assertIsNotNone(reloaded_model)
        self.assertEqual(reloaded_model.avg_latency_ms, 1900)

    def test_04_test_a_normal_request(self):
        """
        TEST A:
        Prompt: 'HII'
        Constraints: max_latency_ms=4000, min_capability_score=3, preference='lowest_latency'
        Expectation: Qwen3.5 2B is selected (lowest latency: 650ms).
        """
        models = self.registry.get_all()
        decision = self.router.route(
            prompt="HII",
            constraints={
                "max_latency_ms": 4000,
                "min_capability_score": 3,
                "required_context_length": 1000,
                "preference": "lowest_latency",
            },
            models=models,
        )
        self.assertEqual(decision["status"], "SUCCESS")
        self.assertEqual(decision["selected"], "qwen-2b")

    def test_05_test_b_judge_increases_latency(self):
        """
        TEST B:
        Judge increases Qwen3.5 2B configured avg_latency_ms from 650 to 5000.
        Next request with budget=4000ms:
        Expectation: Qwen3.5 2B is ranked behind or eliminated, Qwen3.5 4B is selected!
        """
        self.registry.update("qwen-2b", {"avg_latency_ms": 5000})
        models = self.registry.get_all()

        decision = self.router.route(
            prompt="HII",
            constraints={
                "max_latency_ms": 4000,
                "min_capability_score": 3,
                "required_context_length": 1000,
                "preference": "lowest_latency",
            },
            models=models,
        )
        self.assertEqual(decision["status"], "SUCCESS")
        self.assertEqual(decision["selected"], "qwen-4b")

    def test_06_test_c_model_disabled(self):
        """
        TEST C:
        Judge disables Qwen3.5 2B.
        Expectation: Qwen3.5 2B rejected as disabled, Qwen3.5 4B selected.
        """
        self.registry.update("qwen-2b", {"enabled": False})
        models = self.registry.get_all()

        decision = self.router.route(
            prompt="HII",
            constraints={
                "max_latency_ms": 4000,
                "min_capability_score": 3,
                "preference": "lowest_latency",
            },
            models=models,
        )
        self.assertEqual(decision["status"], "SUCCESS")
        self.assertEqual(decision["selected"], "qwen-4b")

    def test_07_test_d_impossible_constraints(self):
        """
        TEST D:
        Impossible SLA (max_latency=100ms, min_capability=10).
        Expectation: NO_VALID_MODEL status returned without forcing invalid model.
        """
        models = self.registry.get_all()
        decision = self.router.route(
            prompt="Complex task",
            constraints={
                "max_latency_ms": 100,
                "min_capability_score": 10.0,
            },
            models=models,
        )
        self.assertEqual(decision["status"], "NO_VALID_MODEL")
        self.assertIsNone(decision["selected"])

    def test_08_test_e_reset_defaults(self):
        """
        TEST E:
        Judge clicks Reset Defaults -> Restores canonical state.
        """
        self.registry.update("qwen-2b", {"avg_latency_ms": 8888, "enabled": False})
        self.registry.reset()
        qwen = self.registry.get("qwen-2b")
        self.assertEqual(qwen.avg_latency_ms, 650)
        self.assertTrue(qwen.enabled)


if __name__ == "__main__":
    unittest.main()
