cmake_minimum_required(VERSION 3.10)
project(cashflow_solver VERSION 2.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Main solver library
add_library(solver_lib STATIC src/solver.cpp)
target_include_directories(solver_lib PUBLIC src)

# Native test executable (for local testing without Emscripten)
add_executable(solver_test src/solver.cpp)
target_compile_definitions(solver_test PRIVATE)

# WASM build (when using Emscripten)
if(EMSCRIPTEN)
    add_executable(solver src/solver.cpp)
    set_target_properties(solver PROPERTIES
        SUFFIX ".js"
        LINK_FLAGS "-s EXPORTED_FUNCTIONS=\"['_solve','_free_result','_get_version']\" \
                    -s EXPORTED_RUNTIME_METHODS=\"['ccall','cwrap','UTF8ToString']\" \
                    -s MODULARIZE=1 \
                    -s EXPORT_NAME='SolverModule' \
                    -s ALLOW_MEMORY_GROWTH=1 \
                    -s ENVIRONMENT='node' \
                    -O2"
    )
endif()
